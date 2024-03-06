/* eslint-disable no-console */
import * as algokit from '@algorandfoundation/algokit-utils';
import algosdk from 'algosdk';
import AlgokitClient from './client';
import { CalculatorClient } from './CalculatorClient';

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
    const appClient = new CalculatorClient({
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

    const method = appClient.appClient.getABIMethod('doMath')!;

    const res = await client.newGroup()
        .addPayment({ sender: alice.addr, to: alice.addr, amount: 0, note: new Uint8Array([1]) })
        .addMethodCall({
            sender: alice.addr,
            appID: Number((await appClient.appClient.getAppReference()).appId),
            method,
            args: [1, 2, 'sum']
        })
        .execute()

    console.log('addMethodCall return value:', result.returns?.[0].returnValue?.valueOf())
}

main();