
### Functions specified in the ENR

- ENR.dhtAddress(): the Kademlia address of a node, calculated according to the ID scheme
- ENR.cipher( packetData, key ): cipher algorithm
- ENR.symmEncryptKey( privKeyA, pubKeyB ): symmetric encryption key generator
- ENR.asymmEncrypt( packetData, recipient.pubKey ): asymmetric encrypt function
- ENR.signature( packetData, pubKey ): digital signature
- ENR.powValid( packetHash, packetType, packetFormat ): proof of work validity check

packetHash(recipient, packet) = recipient.ENR.hashFunction( recipient.ENR.dhtAddress() + packet )

### Default functions in the first implementation

default cipher: AES256 stream cipher based encryption with additional packet size obfuscation and integrity check

- AES256 stream cipher init vector (16 bytes)
- encoded with stream cipher:
  - random padding length (1 byte)
  - random padding
  - packetData
  - first 8 bytes of Keccak256( paddingLength + padding + packetData )

default digital signature: ECDSA

default symmetric encryption scheme: ECDH key exchange

default asymmetric encryption scheme: ECIES

- g^y (32 bytes)
- cipher( packetData, g^(xy) )

default PoW scheme:

- general packet format: valid if ( packetHash <= 2^256 / difficulty[packetType] )
- introduction packet format: valid if ( packetHash >= 2^256 - 1 - 2^256 / difficulty[introPacket] )

### Packet formats

general packet format:

- pow nonce (8 bytes)
- recipient.ENR.cipher( packetData, recipient.ENR.symmEncryptKey(sender.privKey, recipient.pubKey) )

introduction packet format:

- pow nonce (8 bytes)
- recipient.ENR.asymmEncrypt( packetData, recipient.pubKey )
- sender.ENR.signature( packetData, sender.pubKey )
Note: currently only update packets are accepted in an introduction packet format.

reconnect packet format:

- random size, random content packet
(intended for sending to a specific node to reconnect after a network address change, its packetHash is called the reconnectHash)

packetData format:

- serial number (8 bytes big endian)
- packet type (1 byte)
- rlp encoded packet data (extra fields are allowed)


### Packet types

update:
- ENR
- ReconnectHash
- Timestamp (has no role in the dht protocol, just to help keeping clocks in sync)
sender expects: ack

ping:
- Timestamp
sender expects: ack

ack:
- ReplyTo (packetHash of the acknowledged packet)
- From (mirrored source network address)
- Timestamp

findnodeHash:
- Target
sender expects: neighbors

neighbors:
- ReplyTo
- Nodes

getWaitPeriod:
- Topics
(this is a much cheaper version of getTicket which does not yield a valid ticket but it can be used for finding topic radius and suitable nodes to advertise; also, it requires a much cheaper PoW)

waitPeriod:
- ReplyTo
- WaitPeriods

getTicket:
- Topic
(tickets have been changed so that they are only valid for a single topic because multi-topic tickets introduced a lot of extra complexity and even some weird side effects in the advertisement logic)

ticket:
- ReplyTo
- Topic
- LocalTime
- WaitPeriod
- Signature = sender.ENR.signature( packet serial + Topic + LocalTime + WaitPeriod, sender.pubKey )

topicRegister:
- Ticket = ( packet serial + Topic + LocalTime + WaitPeriod + Signature ) 

topicQuery:
- Topic

topicNodes:
- ReplyTo
- Nodes

forwardPacket:
- To (dhtAddress)
- Packet (general packet format)

forwardedPacket:
- From (dhtAddress)
- Packet (general packet format)

Note: packet forwarding could help the network operate under less than ideal (partially censored) conditions where some regions cannot directly access some other regions through UDP. Providing a TCP gateway access to the DHT also requires packet forwarding. Also, if there are a lot of dishonest nodes and building a reputation/web-of-trust filtering becomes necessary, introduction through an already trusted path might be necessary for building new connections (or at least a better alternative to requiring a huge PoW).
