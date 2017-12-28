### Checkpoint syncing

Checkpoint syncing requires a CHT which is a trie that associates block hashes and TDs (total chain difficulty values) to block numbers.

https://github.com/zsfelfoldi/go-ethereum/wiki/Canonical-Hash-Trie

Knowing the root hash of this trie allows the client to access the entire chain history securely with Merkle proofs so only the last few thousand headers need to be downloaded. Right now we have a hardcoded trusted CHT root hash in geth.

### Trustless syncing logic

Trustless syncing requires a "CHT oracle" contract that somehow knows the latest CHT root hashes. This requires some off-chain computation/interactive validation technology like TrueBit. Here we assume that we have such a contract available.

The proposed algorithm is the following:

```
wait until connected to a peer
get peer.headNumber from handshake
peer.getHeadersByNumber(headNumber-2000, 1)	// download a single header
chtIndex, chtRoot = header[headNumber-2000].state[oracle_address].getCHT()
chtHeadNumber = chtIndex*chtFrequency-1
peer.getHeaderProof(chtIndex, chtRoot, chtHeadNumber) // fetch last header referenced in the latest CHT with Merkle proof
peer.getHeadersByNumber(chtHeadNumber+1, headNumber-chtHeadNumber)	// download and validate headers
fail if the header chain was invalid or the header at headNumber-2000 did not match the previously downloaded one
```

### Detecting forged chain attacks

Checking the last few thousand blocks of the chain is enough to know for sure that it is valid if the difficulty of those individual blocks is sufficiently high. On the other hand if the total difficulty of a chain is low then it is not suitable for an attack because the client is looking for the heaviest chain available. Still, an attacker could forge a chain that has a high TD and very low difficulties at the end of the chain so that it can create valid PoWs there. If the client only checks the end of the chain then it could be fooled to believe it is valid.

Such an attacker chain (probably forked from an existing and valuable chain) should have a section where it drastically reduces its difficulty. Difficulty can only be reduced at a slow rate and the attacker cannot generate enough valid and expensive PoWs to reduce it according to the rules so either there must be a rapid drop in difficulty, an abrupt increase in the TD or there must be thousands of headers without a valid PoW. Both of these scenarios can be detected by a randomized but monotonous sampling of the chain using getHeaderProof based on the CHT we know. The samples should not be more than 2000 blocks apart from each other.

During sampling we can detect if

- the PoW is invalid
- the difficulty changed too much since the last sample
- the increase of TD is impossible between the last and the current samples

Security can be further increased if we add extra sampling points where the difficulty drops with a theoretically possible but quick rate.
