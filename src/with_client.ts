/* eslint-disable no-console */
import * as algokit from '@algorandfoundation/algokit-utils';
import algosdk from 'algosdk';
import AlgokitClient from './client';
import { TestContractClient } from './TestContractClient';

async function main() {
    // Instantiate Clients
    const algod = algokit.getAlgoClient(algokit.getDefaultLocalNetConfig('algod'));
    const client = new AlgokitClient({ algodClient: algod });
    const kmd = algokit.getAlgoKmdClient(algokit.getDefaultLocalNetConfig('kmd'));

    // Create two accounts and get dispesner
    const alice = algosdk.generateAccount();
    const dispenser = await algokit.getDispenserAccount(algod, kmd);

    // Set signers
    client.signers[alice.addr] = algosdk.makeBasicAccountTransactionSigner(alice);
    client.signers[dispenser.addr] = algosdk.makeBasicAccountTransactionSigner(dispenser);

    // Send payment
    await client.sendPayment({ sender: dispenser.addr, to: alice.addr, amount: 10e6 })

    // Create an ASA
    const createResult = await client.sendAssetCreate({ sender: alice.addr, total: 100 })

    const assetIndex = Number(createResult.confirmations![0].assetIndex);
    console.log('Created asset', assetIndex);

    // Instantite an algokit-generated typed client and create it
    const appClient = new TestContractClient({
        id: 0,
        resolveBy: 'id',
        sender: { addr: alice.addr, signer: client.signers[alice.addr] }
    }, algod);
    await appClient.create.createApplication({});

    // Add an ATC from the client composer to a group with other transactions
    const doMathAtc = await appClient.compose().doMath({ a: 1, b: 2, operation: 'sum' }).atc()
    const result = await client
        .newGroup()
        .addPayment({ sender: alice.addr, to: alice.addr, amount: 0 })
        .addAtc(doMathAtc)
        .execute();

    console.log('addAtc return value:', result.returns?.[0].returnValue?.valueOf())


    const methodRes = await client.newGroup()
        .addPayment({ sender: alice.addr, to: alice.addr, amount: 0, note: new Uint8Array([1]) })
        .addMethodCall({
            sender: alice.addr,
            appID: Number((await appClient.appClient.getAppReference()).appId),
            method: appClient.appClient.getABIMethod('doMath')!,
            args: [1, 2, 'sum']
        })
        .execute()

    console.log('addMethodCall return value:', methodRes.returns?.[0].returnValue?.valueOf())

    const txnArgParams = {
        sender: alice.addr,
        appID: Number((await appClient.appClient.getAppReference()).appId),
        method: appClient.appClient.getABIMethod('txnArg')!,
        args: [{ type: 'pay' as 'pay', sender: alice.addr, to: alice.addr, amount: 0 }]
    }

    const txnRes = await client.newGroup()
        .addPayment({ sender: alice.addr, to: alice.addr, amount: 0, note: new Uint8Array([1]) })
        .addMethodCall(txnArgParams)
        .execute()

    console.log('txnArg return value:', txnRes.returns?.[0].returnValue?.valueOf())

    const helloWorldParams = {
        type: 'methodCall' as 'methodCall',
        sender: alice.addr,
        appID: Number((await appClient.appClient.getAppReference()).appId),
        method: appClient.appClient.getABIMethod('helloWorld')!,
    }

    const methodArgRes = await client.newGroup()
        .addMethodCall({
            sender: alice.addr,
            appID: Number((await appClient.appClient.getAppReference()).appId),
            method: appClient.appClient.getABIMethod('methodArg')!,
            args: [helloWorldParams]
        })
        .execute()

    console.log('methodArg return value[0]:', methodArgRes.returns?.[0].returnValue?.valueOf())
    console.log('methodArg return value[1]:', methodArgRes.returns?.[1].returnValue?.valueOf())

    const nestedTxnArgRes = await client.newGroup()
        .addMethodCall({
            sender: alice.addr,
            appID: Number((await appClient.appClient.getAppReference()).appId),
            method: appClient.appClient.getABIMethod('nestedTxnArg')!,
            args: [{ type: 'methodCall', ...txnArgParams }]
        })
        .execute()

    console.log('nestedTxnArgRes return value[0]:', nestedTxnArgRes.returns?.[0].returnValue?.valueOf())
    console.log('nestedTxnArgRes return value[1]:', nestedTxnArgRes.returns?.[1].returnValue?.valueOf())

    const secondTxnArgParams = {
        type: 'methodCall' as 'methodCall',
        sender: alice.addr,
        appID: Number((await appClient.appClient.getAppReference()).appId),
        method: appClient.appClient.getABIMethod('txnArg')!,
        args: [{ type: 'pay' as 'pay', sender: alice.addr, to: alice.addr, amount: 1 }],
        note: new Uint8Array([1])
    }

    const doubleNestedTxnArgRes = await client.newGroup()
        .addMethodCall({
            sender: alice.addr,
            appID: Number((await appClient.appClient.getAppReference()).appId),
            method: appClient.appClient.getABIMethod('doubleNestedTxnArg')!,
            args: [{ type: 'methodCall', ...txnArgParams }, secondTxnArgParams]
        })
        .execute()

    console.log('doubleNestedTxnArgRes return value[0]:', doubleNestedTxnArgRes.returns?.[0].returnValue?.valueOf())
    console.log('doubleNestedTxnArgRes return value[1]:', doubleNestedTxnArgRes.returns?.[1].returnValue?.valueOf())
    console.log('doubleNestedTxnArgRes return value[2]:', doubleNestedTxnArgRes.returns?.[2].returnValue?.valueOf())
}

main();