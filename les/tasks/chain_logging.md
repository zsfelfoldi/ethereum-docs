Here are the two basic structures required for chain based logging; This is just a rough draft, no need to follow it exactly.

### ObserverChain

ObserverChain (implemented in les/observer package) creates observer blocks, stores them in the database and can access them later. Observer blocks have the following fields:

- PrevHash		common.Hash
- Number		uint64
- UnixTime		uint64
- TrieRoot		common.Hash // root hash of a trie.Trie structure that is updated for every new block
- SignatureType	string	// "ECDSA"
- Signature		[]byte	// 65-byte ECDSA signature

Note: Signature is based on the hash of the RLP encoding of the struct while the "Signature" field is set to nil. For signing with ECDSA see example here:
https://github.com/ethereum/go-ethereum/blob/master/les/protocol.go#L144

ObserverChain has the following exported functions:

- func NewObserverChain(db ethdb.Database) *ObserverChain	// init structure, read existing chain head from db if possible
- func (o *ObserverChain) GetHead() *ObserverBlock
- func (o *ObserverChain) GetBlock(index uint64) *ObserverBlock
- func (o *ObserverChain) LockAndGetTrie() *trie.Trie	// lock trie mutex and get r/w access to the current observer trie
- func (o *ObserverChain) UnlockTrie() // unlock trie mutex
- func (o *ObserverChain) CreateBlock() *ObserverBlock  // commits current trie and seals a new block; continues using the same trie (values are persistent, we will care about garbage collection later)
- func (o *ObserverChain) AutoCreateBlocks(period time.Duration)  // creates a new block periodically until chain is closed; non-blocking, starts a goroutine
- func (o *ObserverChain) Close()

### EventLogger

- func NewEventLogger(o *ObserverChain, keyPrefix []byte) *EventLogger
- func (e *EventLogger) AddEvent(key []byte, event interface{})
  - get current UnixNano time
  - rlp encode event
  - get trie from e.o
  - add new entry in trie: e.keyPrefix + key + BigEndian(time) -> eventRlp
  - unlock trie
- func (e *EventLogger) NewChildLogger(keyPrefix []byte) *EventLogger // returns a new logger with the same observer chain and the new key prefix appended to the existing one

### Events to be logged

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

- request:				"event/peer/"+peerID+time -> evRequest{reqType, reqCount, serveTime, cost, bufferValue, error}
