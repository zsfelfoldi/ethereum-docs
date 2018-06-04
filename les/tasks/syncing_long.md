# Trustless checkpoint syncing

## Checkpoint contract

When a new checkpoint is validated, the checkpoint contract emits a log event with `"checkpoint"` + `uint32(chtIndex)` topic and `sectionHead`, `chtRoot` and `bloomTrieRoot` in the data field. The actual format may be different but it should contain this information.

## Server announcement

The server announces its "best CHT" to newly connected clients during handshake. Best CHT is the highest index CHT that satisfies the following criteria:

- the server has calculated it locally
- the log event filter has found an announcement containing the same checkpoint and has at least 20000 confirmation blocks on top

## Syncing method

- add the announced checkpoint. The hardcoded checkpoint is currently added by `light.LightChain.addTrustedCheckpoint`: [https://github.com/ethereum/go-ethereum/blob/master/light/lightchain.go#L119]
- get the last header of each epoch (30000 block chain segment) covered by the CHT using `GetHeaderByNumber`
- find the last one where TD (total difficulty) is not more than 99% of the announced head TD
- use regular downloader syncing starting from the next block (call it `headerSyncStart`) up to the announced chain head
  - Note: the downloader's header syncing mode (used by both light and fast sync) verifies header PoWs by random sampling. The PoWs of the last 2000 blocks are all verified. Other header transition rules (like difficulty and TD changes) are fully verified for each downloaded header.
  - Note #2: the current syncing method is realized in `les.ProtocolManager.synchronise`: [https://github.com/ethereum/go-ethereum/blob/master/les/sync.go#L64] This method can be used with `headerSyncStart` added as an extra parameter (right now we start syncing from `chtIndex*32768` which is the first block not covered by the CHT)
- filter for the log event with the announced checkpoint in the range `chtIndex*32768` to `head-20000`, fail if not found
- for each unsynced epoch (the ones before `headerSyncStart`) take the already downloaded last header and calculate the TD difference from the end of the previous epoch (called `epoch_TD`)
- put the epoch indexes in a `les.weightedRandomSelect` structure using `epoch_TD` as weight and randomly select a fixed number of epochs (somewhere between 5 and 20) where we check PoWs
- iterate on each unsynced epoch:
  - randomly select and download headers from the epochs selected for PoW checking with an average frequency of 1 in 100 and check PoWs
    - Note: checking PoWs requires pre-generating the Ethash verification cache for each epoch which takes a few seconds even on a strong computer. This is the reason why we don't sample all unsynced epochs.
  - randomly select and download headers from other unsynced epochs with an average frequency of 1 in 2000
  - run total difficulty check and chain identification check on all downloaded headers in the epoch (TD check should start with the previous epoch head and end with the current one). If the difficulty check downloads more headers, run chain identification check on them too, and if they are in an epoch selected for PoW checking then run PoW check on them too

### Total difficulty check

Total difficulty check verifies whether total difficulty actually increases according to individual block difficulties. It is called on pairs of neighboring header samples (call them A and B):

```
func tdCheck(A, B) bool {
  if B.number == A.number+1 {
    return B.td == A.td + B.diff
  }
  if B.td - A.td <= MAX(A.diff, B.diff)*(B.number-A.number) {
    return true
  }
  C := GetBlockByNumber((A.number+B.number)/2])
  return tdCheck(A, C) && tdCheck(C, B)

```

Since it relies on probabilistic sampling it does not guarantee the detection of any TD fraud but it detects any significant amount of fraudulent TD increase with a very high probability.

### Chain identification check

Chain identification check provides a method to prove that a block (if valid) is a descendant of a specific older block called an identification block or IdBlock. A chain can be identified by one or more IdBlocks. An IdBlock can be the genesis block of a chain, the first block after a fork or basically any block. The chain identification contract can store recent canonical block number -> hash associations upon anyone's request and these can be used as IdBlocks. If the chain uses IdBlocks other than the genesis block (which unfortunately can only be stored by the contract in case of new chains because it can only see the past 255 block hashes) then those should be listed in the chain configuration.

The identification process consists of a simple contract call which performs a single read. The tricky part here is that old states are not stored by most of the full nodes so we need some extra mechanism (maybe also a separate database) to store this contract's storage and the Merkle proofs leading up to it from each block's state root. We are probably going to need this for Casper's contract too so we should come up with a nice generalised method for keeping some contract data permanently available.

## Security considerations

Light client security model is based on the assumption that an attacker might be able to mine an invalid block on top of a valid chain but can not keep its fork the longest because it will be mining alone on a chain that breaks consensus rules. A header that already has a few confirmations on top with valid PoWs can be considered secure (more security needs more confirmations). With trustless checkpoint syncing our security goal is not to ensure that the entire chain is correct but to run a check that cannot be passed with a forged chain that was significanty cheaper to create than the resource costs of mining a valid header chain with the same TD.

By random sampling the unsynced epochs we cannot guarantee the continuity of the header chain but chain identification ensures that each checked header should either be a valid descendant of the latest IdBlock or created by the attacker specifically for attacking the given chain. Including parts of a more valuable chain cannot be used to reach a significantly higher TD. Therefore in order to achieve a higher apparent TD than the most valuable valid chain the attacker has to create its own headers. Random PoW checking also ensures that the vast majority of these headers should also contain valid PoWs in order to have a realistic chance of passing the checks. Total difficulty check makes it impossible to use cheap PoWs and still report a high TD at the end.

Although the above checks ensure that TD can not be faked significantly higher, since TD is unfortunately not part of the consensus and only stored in the CHT it would be possible to marginally increase the TD of an existing chain with a fake CHT, then mine a few attacker blocks (valid header, changed state) on top, also fake the CHT announcement and present it as the longest chain. By thoroughly checking at least the last 1% of the chain though (including the part where the correct CHT is announced) we can make it already really expensive to change anything in the canonised CHT, therefore still requiring a significant portion of total mining power in the hands of the attacker in order to present an apparently longest chain that passes the checks.

## A few notes on future compatibility

### Casper FFG

With Casper FFG we can probably keep using the same syncing method. According to [https://eips.ethereum.org/EIPS/eip-1011] the chain value formula changes to `highest_justified_epoch(head) * 10**40 + head.total_difficulty` which means that finality has an absolute priority over TD but we can still do our initial sync based on highest TD. Basically we can trust miners to keep mining the most valuable chain so even though the finality contract is what drives them primarily, TD will follow and the most valuable chain will also usually be the highest TD chain. Even more importantly, a chain where a fake finality has been forged will never be the highest TD. Once we're synced up to the highest TD and evaluated the finality contract, we can start following the most valuable chain according to Casper FFG rules and it is going to be the same or very close to the synced highest TD chain. Most importanty the validated CHT will definitely be the same.

### Casper PoS

The same syncing method can probably be applied to PoS with a few modifications but it is outside the scope of this document to go into details. With full PoS there is no need to generate Ethash verification caches so random sample checking consensus rules across the entire chain is feasible. It is also necessary because the value of signatures depend on the correct knowledge of the validator set. Random checks should probably also make statistics of the validating signatures and compare it against the known validator weights and increase sampling density if it seems improbable that we find the given signatures with the given frequency.

