## Server event logging

Ensuring light client operation requires two things: a properly implemented protocol and active server connections with suitable service quality. The first one is easier to test and control in a synthetic environment while the second one depends on many factors and is hard to ensure. It requires efficient strategies for resource allocation and incentives to run servers. Both of these are affecting the network in indirect ways so in order to find the most useful models and strategies we also need continous feedback from a number of reliable nodes to see which processes need improvement and how they are affected by changes.

In this document we assume a key/value database backend that 


https://github.com/zsfelfoldi/ethereum-docs/blob/master/les/tasks/chain_logging.md

### Events to be logged


evDhtLookup{A, B, X, N1..Nn}

#### General events

- startup:						"event/general"+time -> evStartup{}
- shutdown:						"event/general"+time -> evShutdown{}

- received ETH/LES connection	"event/general"+time -> evConnReceived{peerID, protocol}
- accepted ETH/LES connection	"event/general"+time -> evConnAccepted{peerID, protocol}
- closed ETH/LES connection)	"event/general"+time -> evConnClosed{peerID, protocol, error}

- block processing started		"event/general"+time -> evProcessingStarted{blockNumber, blockHash}
- block processing finished		"event/general"+time -> evProcessingFinished{blockNumber, blockHash}

#### Peer specific events

// connection events are duplicated, time should be exactly the same
- received ETH/LES connection	"event/peer/"+peerID+time -> evConnReceived{peerID, protocol}
- accepted ETH/LES connection	"event/peer/"+peerID+time -> evConnAccepted{peerID, protocol}
- closed ETH/LES connection)	"event/peer/"+peerID+time -> evConnClosed{peerID, protocol, error}

- request:				"event/peer/"+peerID+time -> evRequest{reqType, count, serveTime, realCost, bufferValue, error}

### Questions we are seeking answers for

#### Can we reach the entire topic discovery DHT?

Event logging:
- A sends findNodeHash packet to B, lookup target is X
- B sends N1..Nn list of known nodes closest to X
- log: `evDhtLookup`

A "final lookup" is 

Analysis tool #1: lookups should find the node with the address closest to the lookup address. Therefore filter for cases when
- node A found node N at time T1
- node B was looking up address X at time T2 and the closest node it found was M
- `dist(N, X) < dist(M, X) && abs(T1-T2) < 10min`

Analysis tool #1

#### Is our request load limitation/distribution model suitable for the purpose? How can we generalize it to introduce different priority levels for paying clients?

https://github.com/zsfelfoldi/go-ethereum/wiki/Client-Side-Flow-Control-model-for-the-LES-protocol

Server load limitation requires some kind of resource cost estimation for served requests. In the current implementation it is a simple formula that still needs to be evaluated whether it really gives a meaningful estimate: it is the time (nanoseconds) spent creating the reply, weighted by 1/N where N is the number of requests served simultaneously in each moment. This is called the "real cost" of requests. LES flow control also requires an upper estimate for the expected real cost of requests, which is modelled as `BaseCost` + `ReqCost` * `count`, where `count` is the number of individual elements asked in the request. This is currently calculated by performing a linear regression on (`realCost`, `count`) pairs of served requests of each message type and then multiplying this average estimate by a constant factor of 3. 

By logging `evRequest` we can create statistics of real cost distribution and see whether it is close to a linear function of `count` for each message type or whether we need a more sophisticated cost evaluation model. Unweighted serving time (`serveTime`) is also logged in order to evaluate the performance aspects of parallel request serving. Logging `evProcessingStarted` and `evProcessingFinished` lets us determine how much block processing affects request serving performance.

Analysis tools:
- filter for given `reqType`, do a 2D plot of `realCost` vs `count`
- filter for given `reqType`, do a 2D plot of `serveTime` vs `count`
- filter for given `reqType` and `count`, do a 2D plot of `realCost` vs `serveTime`
- for any of the plots paint those events that happened during block processing with a different color

#### How many client connections can we safely accept? Can we refine our limitation model?

Currently we are accepting a fixed (small) number of peers to protect the server from heavy load. This limitation could be refined as discussed here in order to increase the number of available service slots:

https://github.com/zsfelfoldi/ethereum-docs/blob/master/les/service_model.md#free-service-model

This introduces additional parameters and complexity though so we need some feedback to check our assumptions.

Analysis tools:
- average number of connected peers in a given time window
- total connection time for each peer
- total `realCost`, total `serveTime` per total connection time for each peer

Correlation factor between each peer and all other peers can be estimated as `serveTime / realCost - 1` which gives the average number of other requests being served simultaneously with the requests of the given peer. These values should be enough to estimate the probability of server saturation and consequent peer drops for any given `n` and `N` peer count values (see the model description).


