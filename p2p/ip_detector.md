### IP detector mechanism proposal

This document outlines a proposed mechanism for detecting a DHT node's own IP based on peer feedback. The algorithm is based on the following assumptions about the underlying p2p protocol:
- Already established connections may use an encrypted channel. This means that building or rebuilding a connection requires a special `intro` packet and known nodes may not respond to `ping` packets if our network address has changed since the connection was established.
- Creating and processing `intro` packets is expensive and the rate of processing new introductions is limited globally at the receiving end so `intro` packets should only be used when necessary.

#### Interface

Incoming events:
- newNode(*Node, lastMirroredAddress)
- removedNode(*Node)
- feedback(*Node, mirroredAddress, timeout)

Outgoing events:
- ping(*Node)
- intro(*Node)
- updateAddress(address)

`ping` and `intro` packets can be sent either by the IP detector or the p2p network backend. All resulting `feedback` is forwarded to the IP detector.

#### Address detection logic

Associated with each different network address that has been mirrored we store
- a set of nodes who have recently mirrored this address
- recent "votes" on this address

These are called "address groups" and each known node is either in one of these groups or in none of them.

If a node mirrors the same address whose address group it was previously located in, nothing is changed. Otherwise it is added to the new group which also receives an upvote. If it was in another address group previously, we remove it from there and the old group receives a downvote. If a node times out on a `ping` of `intro`, it is also removed from its old group (if it was in one of them) and the group receives a downvote. If at least `downVoteThreshold` of the last `voteCount` votes were downvotes, we remove the entire address group.

`majorityAddress` is defined as the address with the most associated nodes. `currentAddress` is initialized as `unknown`. If the node count of `majorityAddress` is larger than the node count of `currentAddress` (or zero if `currentAddress` is `unknown`) then we choose `voteCount` number of nodes from `majorityAddress` (or all of them if there are less) and ping them. We wait for the `feedback` from each of these selected nodes. If `majorityAddress` still has not changed then we update `currentAddress` and send an `updateAddress` event.

After updating to a new address the network backend takes care of generating a new ENR and sending it to all known nodes, the IP detector does not need to care about this.

#### Reintroduction logic

If our network address is changed we may notice that we stop receiving responses to our `ping` packets from our peers (at least from those who were contacted from the old address). The previously correct address group will soon be deleted and we might end up with no address groups at all or only a small minority of our known nodes being in the currently correct group. In order to ensure that we always have some recent feedback we regulary send `intro` packets with `introFrequency` to randomly chosen known nodes that are not in an address group if the percentage of known nodes that are in an address group are below `introThreshold`.

#### Proposed values for constants

`voteCount`: 20
`downVoteThreshold`: 15
`introFrequency`: 1 sec
`introThreshold`: 25%

