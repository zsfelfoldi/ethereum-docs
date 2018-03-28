## Paid LES service model

Our service model is based on the following assumptions:

- resource/time requirements of serving each type of requests is more or less consistent, at least in the most general case (when nothing is cached)
- serving requests in parallel is more efficient than in a single thread but there is a certain level of paralellism over which the total request serving capacity does not increase significantly
- an important metric of server performance is response time which increases with the number of requests processed in parallel at any time (`parallelReqs`). Therefore there is an ideal range for `parallelReqs` when running at full capacity.


### Load limitation strategy

The server has a hard limit for `parallelReqs` called `maxParallelReqs`. Whenever possible, it uses the flow control mechanism to limit the incoming rate of requests so that the average of `parallelReqs` stays under `targetParallelReqs` in order to avoid queueing and delayed processing. (`targetParallelReqs` < `maxParallelReqs`)

Request cost is specified as the serving time of the request in nanoseconds. The server has some upper time estimates for serving different types of requests (measured at `parallelReqs` = `targetParallelReqs`) which are used by the flow control [1] as `maxCost` estimates. The sum of `MRR` (Minimum Recharge Rate, guaranteed recharge rate of `bufValue` per millisecond) parameters for active clients is limited at `targetParallelReqs` * 1000000. This ensures that the automatic buffer recharge will not allow clients to send requests at a rate that would drive the long-term average of `parallelReqs` over `targetParallelReqs` even when every client is sending requests at the maximum permitted rate.

`bufValue` update is calculated for each peer after serving each request (note that `maxCost` has already been deducted from `bufValue` when accepting the request):

```
bufValue += MRR*(now-lastUpdate)/time.Millisecond
lastUpdate = now
if bufValue > bufLimit {
	bufValue = bufLimit
}
```

`MRR` guarantees a request rate for clients based on a conservative estimate but the server is allowed to recharge the `bufValue` of clients faster if possible. We apply a correction value for bufValue if possible. Positive correction is applied if `realCost` (the actual serving time of the given request) was smaller than the upper estimate `maxCost`. Net negative correction is never directly applied to `bufValue` since the calculated minimum value is guaranteed by flow control rules but if necessary it is deducted from current or future positive correction. Negative correction can come from `congestionPenalty` which is calculated as the time integral of (`parallelReqs` - `targetParallelReqs`) over the serving time of the request, multiplied by a constant factor.

```
bufCorrection -= congestionPenalty
if bufCorrection > 0 {
	bufCorrection = 0
}
if realCost < maxCost {
	bufCorrection += maxCost-realCost
}
if bufCorrection > 0 {
	bufValue += bufCorrection
	bufCorrection = 0
	if bufValue > bufLimit {
		bufValue = bufLimit
	}
}
```

### Prioritization

#### Congestion handling

Although `congestionPenalty` tries to keep `parallelReqs` at or under the target value, it is still possible that too many clients try to use their `bufValue` allowance at the same time, exceeding the `maxParallelReqs` limit. In this case the server has to queue requests. In order to incentivize clients to distribute sudden request bursts among multiple servers and therefore help avoiding congestions, we use a priority queue based on the relative buffer status (`bufValue` / `bufLimit`) after accepting the request and deducting `maxCost`.

#### Paying and free clients

Paying clients have an absolute priority over free clients. This means that no request sent by a free client should be processed as long as requests sent by paying clients are being processed. The processing of a free request may even be suspended while paid requests are being served. `parallelReqs` should be calculated separately for free and paying clients.

### Payment model

The following alternatives have been considered:
- pay per request
- pay for available bandwidth
- some hybrid combination of the two

I am in favor of the second option for the following reasons:
- Servers have more or less fixed expenses and fixed total available bandwidth. By selling bandwidth they can provide more consistent performance per cost and get a more predictable revenue.
- When a client has a request to send, it needs the reply ASAP and does not want to start negotiating and testing the market. The flow control system has been designed with the same priorities in mind, to do the negotiation in advance and help the client to choose the best server to send a certain request to so that it can expect a quick response with a high probability.
- Even if we consider alternatives to the current flow control and service model (which was designed to accomodate the bandwidth-selling approach), giving any kind of guarantee for the clients to answer their requests requires the server to limit the number of its connections and therefore has a minimum opportunity cost over time even if the client does not send any requests.

The hybrid approach (paying both for bandwidth and requests) may be considered at a later point if the observed properties of the bandwidth-selling market suggest that it might be necessary. At the moment I'd consider it unnecessary additional complexity.

Allocating a certain percentage of the total bandwidth for a client is realized by assigning the same percentage of total allowed `MRR` in the flow control system. A client's `bufLimit` is also proportionate to the assigned bandwidth, the `bufLimit` / `MRR` ratio (which is basically a time constant) should be chosen by practical experimentation. Since a certain amount `bufLimit` is required for the client in order to be able to send requests at all, there is also a practical lower limit on assignable bandwidth per client.

#### Market model

Desirable properties for the default bandwidth selling mechanism:

- clients should be able to quickly adjust the required bandwidth and/or the offered payment
- the resource costs of negotiation should stay low, given the necassary funds and payment preferences it should be possible to stay connected for a longer period without constant active participation
- the method of negotiation should permit a relatively simple and easily parametrized automatic client strategy

Since servers have a fixed supply of bandwidth for every moment that becomes worthless when not sold until that specific moment, they are interested in selling it before that moment (either right before or in advance*). Though selling future bandwidth could make sense if there are continously running clients willing to secure service at a suitable price, a basic market method is required that is capable of selling bandwidth "real time" and quickly negotiating with buyers. The chosen method is a "continous auction" where once a bid is sent by a client, it is applied for each subsequent moment until it is revoked, updated or the client's funds account is depleted. The winners and the prices to be paid per time unit are re-evaluated each time a bid is sent, updated or revoked (all of which have a small extra fee).

* Note: there are multiple possible models for selling future bandwidth but these are not discussed further in this document and will not be implemented in the first round. A free market economy is not something that is designed on a drawing board and I believe it would be premature to suggest alternatives to the basic method before it is operational and we have any experience to draw conclusions from.

##### Continous auction

The chosen auction model, Vickrey multi-unit auction [1,2] (the multi-unit generalization of the second-price sealed-bid auction) is "truthful", which means that the optimal strategy for clients is to bid according to their true valuation of the service (the highest price they are willing to pay). In contrast, pay-as-bid auctions do not have this property, in that model clients are incentivized not to reveal the maximum value they are willing to pay but to constantly change their bids in order to find the minimum price at which they can get the desired amount.

Bandwidth is sold in fixed equal units and clients can offer non-strictly monotonic decreasing prices for their first and then their subsequent units. The outcome of a Vickrey multi-unit auction is the same as that of a uniform price or a pay-as-bid auction: when there are N units to be sold in total, the best N offers for individual units are winning. Payments for client A are calculated as (sum of all winning bids)-(sum of A's winning bids)-(sum of all winning bids if A's bids are removed) and is equal to or lower than in case of a uniform price auction (where everyone pays the price of the highest losing bid per unit). When a bid is entered, updated or revoked, the server recalculates the results immediately and notifies those clients whose assigned bandwidth has changed.

Note: reducing the available bandwidth of a client could cause it to accidentally break the flow control rules. In this case there is a 5 second tolerance window where requests are still accepted if they conform the rules according to the old `bufLimit` and `MRR` parameters. Replies that are returned after the bandwidth update message contain buffer values calculated according to the new parameters but `bufValue` does not go negative in case of a tolerated buffer underrun.

#### Market properties

##### Supply vs. demand

Global supply of bandwidth is expected to be mostly inflexible in the short term. The possible cost savings by turning off service for a short period can depend on multiple factors (whether the machine is owned or rented, whether the network bandwidth is paid flat or per megabyte, etc.) but the server has to stay in sync with the blockchain in order to be able to turn service back on when needed. There are significant costs that cannot be saved by turning off LES service for a few hours or even days.

Global demand is probably going to fluctuate quicker than what the supply could immediately adapt to. The price signal from one specific server can motivate its clients to try getting service elsewhere but the demands from individual clients can correlate globally (new ICO, CryptoKitties, etc.), therefore we can expect significant global price fluctuations. 

##### Client strategy

Clients are interested in getting consistent and predictable performance so they are collecting statistical data to help them select good nodes:

- performance experienced on their side vs. the bandwidth promised by the server
- connection success rate
- relative price belonging to similar performance (compared to other nodes at the same time)

The details of the server selection algorithm are still being worked out, with the following goals in mind:

- it should incentivize servers to consistently give the best possible quality of service regardless of current price levels by basing choices partly on long-term statistics* and therefore ensuring demand at the price peaks too, when the largest profit can be earned
- it should be close to ideal for the clients themselves too, the long-term statistics should really be a good indicator of future service quality (at least for servers who operate honestly)

* Short-term factors should affect server selection too (clients should disconnect if the server appears to be useless at the moment) but long-term stats should make them the preferred choices if they are capable of providing a performance/price ratio at least similar to the other simultaneously connected nodes. Clients always try to have multiple active server connections, buying only part of the required bandwidth from each. This is necessary both for ensuring a continous connection to the network and being able to detect short-term relative price/performance changes and choose less loaded servers.

##### Server strategy

By always selling all available bandwidth at any price (or even giving it away for free when it does not interfere with paid service) servers do not actively participate in the pricing process (at least with the basic market model). They just try to make themselves visible to as many clients as possible in order to earn the best fees the market can offer. Depending on the long-term average of earnings they may decide to scale operations up or down.

Note: servers could try to increase their fees by setting a minimum price but then clients would consider their price/performance ratio worse than their competitors and they would lose more profit during price peaks. 



#### References

1. [Client Side Flow Control model for the LES protocol](https://github.com/zsfelfoldi/go-ethereum/wiki/Client-Side-Flow-Control-model-for-the-LES-protocol)
2. [Lawrence M. Ausubel: "Auctions: Theory"](http://www.cs.cmu.edu/~sandholm/cs15-892F13/Ausubel_Auction_Theory_Palgrave.pdf)
3. [Brian Baisa: "Bid Behavior in the Uniform Price and Vickrey
Auctions on a General Preference Domain"](https://www.amherst.edu/system/files/baisa%20vickrey%20-%20unif_0.pdf)

