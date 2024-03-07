# Problems Addressed

## Mixing of algosdk and algokit-utils

Sending transactions currently requires mixing the usage of algosdk and algokit-utils. 

### Solution

`AlgokitClient` eliminates need for algosdk usage for chain interactions. `AlgokitComposer` is also able to take an `algosdk.AtomicTransactionCompsoer` and add it to its group. 

## Confusing interfaces

Currently, a lot of the interface on algokit-utils can be rather confusing. There are many union types and many ways to do the same thing. For example, in some places when passing a tranasction you use `{txn, signer}`, `{tranasction, signer}`, or `{transaction, from}`. `signer` and `from` can be many different types, inlcuding but not limited to the types used by `signer` or `from` fields in the SDK.

### Solution

`AlgokitComposer` has straight-forward interfaces for all actions. There are no union types and the functions are not clever. There is one way to do a specific action and it is always done that way.

## A lot of async functions

Because of `suggestedParams`, async calls may currently required when forming transactions. This is paticularly annoying when using `.compose()` on an generated app client. Because the chain of function calls require `await` in the middle making it a bit annoying to work with.

### Solution

Nothing async happens until `AlgokitCompose.execute()` or `AlgokitComposer.buildGroup()` 

## Repetitive or old suggestedParams

Suggested params is currently needed for every transaction formation. A common solution is to just get suggested params once, but its possible that the suggested params could be out of date.

### Solution

`AlgokitComposer` caches `suggestedParams` and only does the API call after a certain amount of time has elapsed

## Repetitive signers

For every transaction, there needs to be a way to sign it. Currently there are many different ways to sign transactions with algokit and often you use a `signer` function in multiple places. 

### Solution

`AlgokitClient` allows you to specify a defaultSigner to use for all transactions (useful for wallet interaction). You can also set a unique signer per address (useful for localnet or custodied accounts). Attaching a unique signer to a tranasction is still possible if necessary. 

## Improper fee setting

Many dApps currently do not set fees properly. For example, if an app wants to add extra fees to their current transaction it is common practice to do `(1 + extra_txns) * MIN_FEE`. This is problematic because it does not account for fee scaling.

### Solution (Partial)

`AlgokitComposer` transactions have two fee fields: `flatFee` for setting the flatFee on the transaction and `extraFee` for adding additional microAlgos to the **suggested** fee. This is important because it still takes into account the `feePerByte` recommended by algod for the given transaction. This means you can simple set `extraFee` to `numInners * MIN_FEE` to ensure the fee will always be correct for app calls with inner transactions, even under fee scaling.

### TODO

In the future we need to devise a smart way to handle scenarios where one outer transaction might want to cover the fee for another out transaction. If `feePerByte` is non-zero, then this is hard to calculate. 

## Differing validity window and wait times

It is currently common practice to use the default validity window (1000 rounds) on transactions but only wait a short amount of rounds for confirmation (typically 3-5). This can lead to a confusing UX and potentially double transactions if the user is not aware of the validty windows of their transactions in the event of longer confirmation times.

### Solution

`AlgokitComposer.defaultValidityWindow` is set to a much more reasonable window (for user-facing dApps) of 10 rounds (~30 seconds). By default, `AlgokitComposer.execute()` will wait until the last valid round in the transction group has passed to ensure tranasctions are confirmed when the user is not expecting it.

## ABI method argument composability

Currently, if an application expects another ABI method call as an argument there is no great way to handle that other than manually building the ATC and deconstructing the group. Even after doing that, the return values for the argument calls will not be availible.

### Solution

`AlgokitComposer` method calls support other method calls as arguments.

