### LES service model assumptions

- LES is available either as free or paid service
- paid service can guarantee availability and short response times
- client bandwidth demand fluctuates with time, good service quality requires reserve capacity
- for-profit LES servers can still give away their extra capacity for free (with lower priority than paid service)
- free service is a good indicator of high bandwidth capacity and therefore the capability to provide good service
- paying clients will prefer servers which already gave them free service so free service can act as an advertisement

### Free service model

Request frequency is limited by client side flow control:

https://github.com/zsfelfoldi/go-ethereum/wiki/Client-Side-Flow-Control-model-for-the-LES-protocol

The flow control mechanism can theoretically ensure that clients can never send too many requests simultaneously and all requests will be served with a short latency. Such a strong guarantee comes at a high price though: the number of client connections should be low enough to ensure that is all of them exhaust their flow control buffer at once, still all requests can be quickly served (under 100ms). This might be suitable for paying clients but since most of the clients most of the time are just syncing headers, free clients would probably be happy with being able to connect more easily and get a weaker guarantee of performance.

Let us assume that
- we have enough capacity to guarantee quick service for `n` clients
- based on usage statistics we allow `N` clients to be connected simultaneously
- if they send too many requests at the same time (the total cost of queued requests a.k.a. `totalQueuedCost` is greater than `ServerParams.BufLimit`), some of them are dropped

Clients are dropped based on their "correlation penalty" scores. When a client sends a request with a given `cost`, it gets a `cost * totalQueuedCost` correlation penalty score (`CPS`). When `totalQueuedCost` hits the limit, the client with the highest cumulative `CPS` is dropped. This condition discourages clients from wasting server resources (since getting a new connection is usually hard). It also encourages them to distribute their load between all connected servers (the flow control itself encourages and helps them to do the same thing too) and discourages them from connecting to the same server with multiple identities.

### Paid service model

Clients can pay individual servers to buy priority service. A priority service means
- guaranteed connection (unless the server is full with other prioritized clients). Free clients may be kicked out.
- prioritized service; no free requests are served as long as there are requests in the prioritized queue. Also there is considerably less or no "overbooking" ('N' to 'n' ratio) in case of paid clients.

It is the responsibility of the client to choose a server that it trusts with its money; a server can disappear or lower its service quality at any time and still keep its money, at the cost of ruining its reputation. Reputation is built by providing free service (any possibly with other "common good" acts too, like sending new CHT roots to the CHT validator contract). A simple form of server reputation is already realized in the server pool which collects statistical data of connection availability and service quality.

The following payment methods have been considered so far:
- Raiden (would be suitable but not ready yet)
- uRaiden (simple and ready but requires an on-chain transaction to set up each payment direction)
- SWAP (Swarm's payment channel) (same applies as for uRaiden)
- some probabilistic payment method (probabilistic approach might be suitable and convenient for our use case but no specific technology has been evaluated yet)

We also need to discuss different kinds of payment models and find out what would be convenient and acceptable for the users:
- flat per-time payment for a live prioritized connection
- pay per request, with an upper limit per second/minute/hour/whatever time period
- the two combined
- quickly adjustable priority/payment levels (so that clients can lower or even stop payments when there is no need for extra priority, pay more during load peaks); more user attention required, higher price flexibility
- long-term adjustable priority/payment levels; more convenient, users can set the preferred balance between payment amounts and general user experience and not care about it all the time

