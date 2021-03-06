## Observer network

This document proposes a peer-to-peer, trust-based, consensusless data gathering and processing mechanism based on two simple primitives: "observer chains" (OC) and "chain filters" (CF). Its intended purpose is to help creating and operating complex and scalable protocols by establishing peer-to-peer reputation and accounting that could serve as the basis of micropayment compensation in a decentralized network and enabling complex delegated data gathering and processing services between pseudonymous peers. It could enhance the performance and availability of existing Ethereum protocols (ETH, LES) and also help building more advanced topologies for handling hierarchical blockchain structures (sharding, state channels).

Note: most of the potential applications and the details of implementation are still being worked on. The purpose of this document is to give an overview of my long-term plans regarding OCs and CFs and the reasons why I'd like to go in this direction. The first practical goals I'd like to achieve are event logging with OCs and on-chain CHT/BloomBitsTrie validation with CFs. Feedback is appreciated on the rest too.

### Possible applications in the light client ecosystem

#### Event logging

Since the OC is intended to be a general purpose event logging mechanism, its simplest use case is collecting diagnostic/statistical data. In addition to diagnostic purposes some of this data may also be post-processed with chain filters to provide service quality/capacity/availability estimates for clients. Since most of these logs can be easily falsified, such a use case that has economic consequences may require some kind of reputation based on cross-correlation of client/server logs in order to detect false claims.

See also:

https://github.com/zsfelfoldi/ethereum-docs/blob/master/les/logging.md

https://github.com/zsfelfoldi/ethereum-docs/blob/master/les/tasks/chain_logging.md

#### Micropayment accounting, building a reputation network

Offering (improved) service for money requires some kind of accounting mechanism. Selling service also requires reputation which is based on being known for good service in the past. This self-reinforcing effect might create an entry barrier for new and small capacity servers (just like in case of traditional markets). In order to lower this barrier it would be desirable to make reputation "transitive" by good servers mutually recommending each other. One possible way of realizing this is by selling not just their own service but each other's service tokens too. This requires a transparent accounting that shows what tokens a certain server is offering to their clients and how much it has actually sold. The clients and the cooperating servers all want to be sure that they see the same numbers. Also the total outstanding number of tokens issued by a certain server might be interesting too before buying more of its tokens. OCs are suitable for running such a trustworthy accounting.

See also:

https://github.com/zsfelfoldi/ethereum-docs/blob/master/les/service_model.md

#### CHT and BloomBits trie validation

Chain filters can be used for on-chain validation too:

https://github.com/zsfelfoldi/ethereum-docs/blob/master/les/filter_observer.md#on-chain-validation

Having an on-chain source for these trie root hashes is required for trustless checkpoint syncing:

https://github.com/zsfelfoldi/ethereum-docs/blob/master/les/tasks/syncing.md

#### Delegated processing and filtering

Some future applications may require evaluating complex functions that access huge amounts of state data that would be too expensive to locally process for a light client. In a many-blockchain scenario (like the planned "sharding" of the Ethereum chain) it might also be too expensive to just follow every relevant chain and filter for the interesting events. A massively scalable world computer ecosystem is going to require delegated processing services too, in addition to the consensus mechanism. An observer network built from OCs and CFs can process the states and events of many chains block by block and collect all interesting results for the client. The client can build its observer network with the desired amount of redundancy in order to detect and punish potential incorrect results.

### Observer chains

An observer chain is basically a "personal" blockchain that is generated by individual nodes and validated by a single signature. Each block contains an Ethereum trie structure that is used as a general purpose key/value store. Interpretation of its contents (called "statements") is application-specific, there are no general rules applying to its contents. Application-specific state transition rules can be defined inside the trie itself (we call these voluntary rules "promises"). There are some general rules applying to the chain itself though (see below).

Observer blocks have the following fields:

- ParentHash	common.Hash
- Number		uint64
- UnixTime		uint64
- Statements	common.Hash // root hash of a trie structure that is updated for every new block
- SignatureType	string	// "ECDSA"
- Signature		[]byte	// 65-byte ECDSA signature

Whether the statement tries of subsequent blocks are interpreted as independent key/value stores (each new statement recorded in one block only) or an "evolving" database where trie entries are inherited from the previous statement trie is up to the specific application. Separate key ranges can be handled differently too. It is also allowed to leave data in the trie forever and just forget entire subtries that are no longer relevant to anyone. Ensuring data availability is the responsibility of everyone who might want to prove the existence of a certain statement later.

#### Rules and security deposits

An OC may be backed by a security deposit on the main public Ethereum chain that is locked for a certain amount of time at a judge contract that can take the deposit away if a rule or promise is broken (and transfer a portion of it to the prover of the fraud).

Observer chains have to follow these general rules:

- numbers should be consecutive
- each number should be used only once (rolling back and forking are forbidden)
- timestamps should be monotonic

#### Observing and filtering

The most important function of an OC is to "observe" other blockchains and certify the results of certain CFs applied to them. New statements are added for every new processed and valid block of observed chains:

`"processed" + chainID + blockNumber + blockHash -> parentHash + value + localTimeStamp`

where `value` is the numeric value on which fork choice is based; its meaning depends on the consensus mechanism used by the given chain (in case of PoW chains it is the "total difficulty" of the block).

Adding observed block statements means no responsibility by default but additional promises may be made about further actions taken for new blocks of certain chains. One possible promise is to evaluate certain CFs on these blocks and add certificate statements. A filter certificate looks like this:

`"processed" + chainID + blockNumber + blockHash + "filter" + filterHash -> filterBlockHash`

##### Self-filtering

Running a CF on our own OC should be handled a little bit differently. Processed block statements are not necessary. It is also not necessary to create filter blocks at all. Instead the filter state hash is updated in the same single statement of the OC:

`self-filter + filterHash -> filterState`

In this case the OC itself serves the same purpose as the filter chain, it hashes all previous input blocks and filter states. The result of filtering a certain observer block is always included in the next block. This construction makes it cheaper to run self-filters that do not change their internal state after every block because in these cases the state trie needs no updating at all.

#### Promises

A promise is a self-filter with a special definition and meaning. It is created by adding `"promise" + filterHash -> 1` and `"promise" + filterHash + "lastState" -> initialState` entries. If these entries exist in block `i` then the filter should be evaluated for blocks `i` and `i+1` too. The resulting filter state is always stored in the next block. This means that if `"promise" + filterHash -> 1` is present in block `i` but removed in block `i+1` then `lastState` will be present in blocks `i+1` and `i+2` too, then it is also removed. A special `lastState` value in block `i+1` signals that the promise has been broken in block `i`, every other value should be considered a valid internal filter state (see below). Evaluating the function for one more block after the definition has been removed ensures that the promise filter can decide whether its definition can be removed or not.

Breaking a promise results in a lost deposit. The judge contract accepts Merkle proofs of the filter definition entries that may prove an invalid state transition. If any of the state transitions is challenged in a limited time window after publishing it then the signer has to defend it through an intetactive validation process. A missing `lastState` entry results in losing the deposit too.

Note: a signer could try to avoid punishment after breaking a promise by withholding a part of its statement trie where the relevant filter state should be. A simple protection against this type of fraud is to always check the availability of every signer's statement subtrie belonging to the `"promise"` prefix before accepting any observer block. Any missing trie node in this subtrie should be considered a proof of dishonest operation, even if we don't know the meaning of the missing promises. Later more sophisticated ways of ensuring data availability (see "proof of availability") could be used too.

Note 2: promises that are "stateless" or at least usually do not change their internal state do not require significant extra resources from the signer since the statement trie needs no updating. Also the filter function of these promises usually do not need to be evaluated by the signer at all since the promise has to be kept anyway.

#### Building trust

Even though there are very few general rules applying to the contents of an OC and the meaning of certain parts of the statement trie are only known by their intended recipients, collecting all statements and promises coming from a signer into a single blockchain structure has certain advantages over communicating on separate channels. If statements are suitably organized then a signer can not get away with making contradicting statements to different recipients (which is very useful in accounting applications for example). A locked deposit that has not been taken away is an indicator for other peers to be able to somewhat trust the promises and certificates that the signer makes. Although this is a weak guarantee compared to public consensus, in many cases it is enough to build peer-to-peer trust and avoid spammers, sybil-attackers and fake service providers. Also, the probability of a successful fraud can be exponentially decreased by increasing the redundancy and having multiple nodes do the same calculation or check the same condition.

### Chain filters

A chain filter is defined by a stateful deterministic machine that takes the root hash of a recursively hashed data structure (more specifically the head block hash of a blockchain, observer chain or another chain filter) as an input. This function is executed on each consecutive block of the input chain.

Chain filter blocks have the following fields:

- ParentHash	common.Hash
- InputBlock	common.Hash
- FilterState	common.Hash // can be a root hash of a trie or any other storage structure used by the filter

The filter's internal state is also represented as a recursively hashed data structure. The state machine is defined by a filter function that takes the last filter block hash (that references the last filter state) and the new input block hash as inputs and returns the new filter state root hash:

```
filter_block[i].FilterState = filter_function(filter_block[i].ParentHash, input_block[i].Hash)
```

The intended input dataset can either be defined as the entire input chain and everything referenced by it or just a subset of it (like the last N blocks only). It is also allowed to define an extended input dataset including some external data referenced by hash. A useful example is an observer chain observing other chains. In this use case we can allow the filter function to access not only the OC but some of the observed blockchains too.

#### Filter definition

```
filterHash = SHA3("filter" + VmStateHash + chainID + firstInputBlockHash + initialFilterState)
```
where

- VmStateHash describes a virtual machine's initial state with the filter code loaded
- chainID identifies the input chain
- firstInputBlockHash is the first processed block's hash; can either be the genesis hash or any other block hash
- initialFilterState is the initial internal state of the filter

#### Virtual machine and interactive validation

The filter function is specified in a deterministic VM that is suitable both for just-in-time compilation and interactive validation. A limited (deterministic) version of WASM is a good candidate because a validator contract has already been developed by TrueBit.

The filter function runs in an environment that provides it access to input and state data through a "reverse hash" system call:

```
reverse_hash(hint, hash, target_address, size_limit)
```

The field `hint` follows a convention defined for each different input data structure and helps the executing environment to find the requested piece of data. We assume that the filter function gives proper hints and only tries to access its intended input and state dataset. We also assume that it uses a limited amount of memory and time to complete (see below).

#### Trust and shared assumptions

Trust in a filter result is based on the assumption that if it would be wrong it would be challenged and the signer would lose money. This is not a strong guarantee like global consensus but multiple independently selected observers can exponentially reduce the chance of a successful attack. There is another hidden assumption here though: that a valid result can be calculated by honest observers. If it is impossible to get a valid result (but the impossibility of it cannot be proven) then attackers could still certify a wrong result and no one could challenge them. This is possible in three cases:

- if the calculation never stops or just takes too long
- if the filter function is trying to access something that is not part of the input dataset
- if some of the input data is not available

Number 1 and 2 are mostly technical problems, they can be avoided either by using trusted filter functions only or by adding a VM metering layer (like eWASM) and a more sophisticated input access backend that does not allow to "reverse" any hash but actually knows the structure of the input data. Number 3 is trickier because you cannot challenge a calculation if you can't re-run it step by step. Therefore you can only trust a certified and unchallenged CF result if you assume that the input chain was publicly available during the challenge period. This is something you can usually assume if the input is a public chain but in case of private chains, state channels or observer chains you have to take this limitation into consideration and either check the availability yourself or get some kind of proof of availability.

Note: realizing a "proof of availability" mechanism with OCs and CFs as a part of the observer network is probably possible but the details are still being worked out.

See also:
https://github.com/ethereum/research/wiki/A-note-on-data-availability-and-erasure-coding

There is also a case that could prevent defending a correct execution: if the result of a `reverse_hash` is too large to be sent to the judge contract. Therefore accessed data size should be limited. Unfortunately in the currently used EVM state format there is one field where size is not limited: the contract code. Accessing contract code is not required at the moment for any planned use cases but if ever needed, some workaround would be required. For newly designed input data formats it is always recommended to use some kind of tree-hashing in case of arbitrarily long data. For example Swarm hashed data is suitable as an input. (Swarm is also aiming to be able to provide proof of data availablility)

#### On-chain validation

Though CF results are usually only certified by OCs and do not become a part of any global consensus, it is also possible to publish them on chain by someone with a locked deposit and wait for anyone to challenge the result. If no challenge happens or the result is successfully defended, it can be considered valid. The input data availability assumption has to be considered in this case too. The easiest scenario is when the input chain is the same chain where the validation and publication happens. Calculating LES protocol's CHTs and BloomBits tries is such a case and validating them on chain should be one of the first use cases of chain filters.


