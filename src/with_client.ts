/* eslint-disable no-console */
import * as algokit from '@algorandfoundation/algokit-utils';
import algosdk from 'algosdk';
import Client from './client';
import { CalculatorClient } from './CalculatorClient';

async function main() {
    // ===== Create two accounts =====
    const alice = algosdk.generateAccount();
    const bob = algosdk.generateAccount();

    console.log("Alice's Address:", alice.addr);

    // ===== Get information about alice from algod =====
    const algod = algokit.getAlgoClient(algokit.getDefaultLocalNetConfig('algod'));
    const client = new Client({ algodClient: algod });

    console.log("Algod verisions:", await algod.versionsCheck().do());
    console.log("Alice's Account:", await algod.accountInformation(alice.addr).do());

    // ===== Get some ALGO into alice's account =====
    const kmd = algokit.getAlgoKmdClient(algokit.getDefaultLocalNetConfig('kmd'));
    const dispenser = await algokit.getDispenserAccount(algod, kmd);

    // Transaction signer is a function that allows us to sign transactions for a given account
    client.signers[alice.addr] = algosdk.makeBasicAccountTransactionSigner(alice);
    client.signers[dispenser.addr] = algosdk.makeBasicAccountTransactionSigner(dispenser);

    await client
        .newGroup()
        .addPayment({ from: dispenser.addr, to: alice.addr, amount: 10e6 })
        .execute();

    // See new balance
    console.log("Alice's Account", await algod.accountInformation(alice.addr).do());

    // ===== Create the ASA. ASA === Algorand Standard Asset =====
    const createResult = await client
        .newGroup()
        .addAssetCreate({ from: alice.addr, total: 100 })
        .execute();

    // Get assetIndex from transaction
    console.log("Create result confirmation", createResult.confirmations![0]);
    const assetIndex = Number(createResult.confirmations![0].assetIndex);

    const appClient = new CalculatorClient({
        id: 0,
        resolveBy: 'id',
        sender: { addr: alice.addr, signer: client.signers[alice.addr] }
    }, algod);

    await appClient.create.createApplication({});

    const appAtc = await appClient.compose().doMath({ a: 1, b: 2, operation: 'sum' }).atc()

    const result = await client
        .newGroup()
        .addPayment({ from: alice.addr, to: alice.addr, amount: 0 })
        .addAtc(appAtc)
        .execute();

    console.log('return', result.returns?.[0].returnValue?.valueOf())
    return

    // ===== Try to send ASA from Alice to Bob =====
    const asaTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: alice.addr,
        to: bob.addr,
        assetIndex,
        amount: 1,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    const transferAtc = new algosdk.AtomicTransactionComposer();
    transferAtc.addTransaction({ txn: asaTransfer, signer: aliceSigner });

    try {
        await algokit.sendAtomicTransactionComposer({ atc: transferAtc }, algod);
    } catch (error: any) {
        console.warn("Transfer error", error.response.body.message);
    }

    // ===== Fund Bob =====
    const bobFundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: dispenser.addr,
        to: bob.addr,
        amount: 10e6,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    const bobFundAtc = new algosdk.AtomicTransactionComposer();
    const bobSigner = algosdk.makeBasicAccountTransactionSigner(bob);
    bobFundAtc.addTransaction({ txn: bobFundTxn, signer: dispenserSigner });
    await algokit.sendAtomicTransactionComposer({ atc: bobFundAtc }, algod);

    // ===== Opt-in Bob to the ASA and try transfer again =====
    const optIn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: bob.addr,
        to: bob.addr,
        assetIndex,
        amount: 0,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    const optInTransferAtc = new algosdk.AtomicTransactionComposer();
    optInTransferAtc.addTransaction({ txn: optIn, signer: bobSigner });
    optInTransferAtc.addTransaction({ txn: asaTransfer, signer: aliceSigner });
    await algokit.sendAtomicTransactionComposer({ atc: optInTransferAtc }, algod);

    console.log("Alice's Assets", await algod.accountAssetInformation(alice.addr, assetIndex).do());
    console.log("Bob's Assets", await algod.accountAssetInformation(bob.addr, assetIndex).do());

    // ==== Alice buys back ASA from Bob ====
    const alicePayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: alice.addr,
        to: bob.addr,
        amount: 1e6,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    const bobTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: bob.addr,
        to: alice.addr,
        assetIndex,
        amount: 1,
        suggestedParams: await algod.getTransactionParams().do(),
    });

    const buyBackAtc = new algosdk.AtomicTransactionComposer();
    buyBackAtc.addTransaction({ txn: alicePayment, signer: aliceSigner });
    buyBackAtc.addTransaction({ txn: bobTransfer, signer: bobSigner });
    await algokit.sendAtomicTransactionComposer({ atc: buyBackAtc }, algod);

    console.log("Alice's Assets", await algod.accountAssetInformation(alice.addr, assetIndex).do());
    console.log("Bob's Assets", await algod.accountAssetInformation(bob.addr, assetIndex).do());
    console.log("Bob's Min Balance", (await algod.accountInformation(bob.addr).do())['min-balance']);

    // ==== Bob Close out the ASA ====
    const optOut = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: bob.addr,
        to: alice.addr,
        assetIndex,
        amount: 0,
        suggestedParams: await algod.getTransactionParams().do(),
        closeRemainderTo: alice.addr,
    });

    const optOutAtc = new algosdk.AtomicTransactionComposer();
    optOutAtc.addTransaction({ txn: optOut, signer: bobSigner });
    await algokit.sendAtomicTransactionComposer({ atc: optOutAtc }, algod);
    console.log("Bob's Min Balance", (await algod.accountInformation(bob.addr).do())['min-balance']);
}

main();