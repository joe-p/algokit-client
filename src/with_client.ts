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

    // Transaction signer is a function that allows us to sign transactions for a given account
    client.signers[alice.addr] = algosdk.makeBasicAccountTransactionSigner(alice);
    client.signers[dispenser.addr] = algosdk.makeBasicAccountTransactionSigner(dispenser);

    // Send payment
    await client
        .newGroup()
        .addPayment({ from: dispenser.addr, to: alice.addr, amount: 10e6 })
        .execute();

    // Create an ASA
    const createResult = await client
        .newGroup()
        .addAssetCreate({ from: alice.addr, total: 100 })
        .execute();

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
    const appAtc = await appClient.compose().doMath({ a: 1, b: 2, operation: 'sum' }).atc()
    const result = await client
        .newGroup()
        .addPayment({ from: alice.addr, to: alice.addr, amount: 0 })
        .addAtc(appAtc)
        .execute();

    console.log('return value:', result.returns?.[0].returnValue?.valueOf())
}

main();