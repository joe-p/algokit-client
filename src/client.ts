import algosdk from 'algosdk'
import * as algokit from '@algorandfoundation/algokit-utils'

type CommonTxnParams = {
    from: string, signer?: algosdk.TransactionSigner
}

type PayTxnParams = CommonTxnParams & {
    to: string, amount: number
}

type AssetCreateParams = CommonTxnParams & {
    total: number, decimals?: number, defaultFrozen?: boolean
}

type Txn =
    (PayTxnParams & { type: 'pay' })
    | (AssetCreateParams & { type: 'assetCreate' })
    | (algosdk.TransactionWithSigner & { type: 'txnWithSigner' })
    | { atc: algosdk.AtomicTransactionComposer, type: 'atc' }

class ATCWrapper {
    atc: algosdk.AtomicTransactionComposer;
    algod: algosdk.Algodv2;
    getSuggestedParams: () => Promise<algosdk.SuggestedParams>;
    getSigner: (address: string) => algosdk.TransactionSigner;

    txns: Txn[] = [];

    constructor(algod: algosdk.Algodv2, getSigner: (address: string) => algosdk.TransactionSigner, getSuggestedParams?: () => Promise<algosdk.SuggestedParams>) {
        this.atc = new algosdk.AtomicTransactionComposer();
        this.algod = algod;
        const defaultGetSendParams = () => algod.getTransactionParams().do();
        this.getSuggestedParams = getSuggestedParams ?? defaultGetSendParams;
        this.getSigner = getSigner;
    }

    addPayment(params: PayTxnParams): ATCWrapper {
        this.txns.push({ ...params, type: 'pay' });

        return this
    }

    addAssetCreate(params: AssetCreateParams): ATCWrapper {
        this.txns.push({ ...params, type: 'assetCreate' });

        return this
    }

    addAtc(atc: algosdk.AtomicTransactionComposer): ATCWrapper {
        this.txns.push({ atc, type: 'atc' })
        return this
    }

    private buildAtc(atc: algosdk.AtomicTransactionComposer, txnWithSigners: algosdk.TransactionWithSigner[], methodCalls: Map<number, algosdk.ABIMethod>) {
        const currentLength = txnWithSigners.length;
        const group = atc.buildGroup();

        const atcMethodCalls = atc['methodCalls'] as Map<number, algosdk.ABIMethod>;

        atcMethodCalls.forEach((method, idx) => {
            methodCalls.set(currentLength + idx, method);
        });

        group.forEach((ts) => {
            txnWithSigners.push(ts);
        });

        return this;

    }

    private buildPayment(params: PayTxnParams, suggestedParams: algosdk.SuggestedParams) {
        return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: params.from,
            to: params.to,
            amount: params.amount,
            suggestedParams
        });
    }

    private buildAssetCreate(params: AssetCreateParams, suggestedParams: algosdk.SuggestedParams) {
        return algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
            from: params.from,
            total: params.total,
            decimals: params.decimals ?? 0,
            suggestedParams,
            defaultFrozen: params.defaultFrozen ?? false
        });
    }

    async buildGroup() {
        const suggestedParams = await this.getSuggestedParams();

        const txnWithSigners: algosdk.TransactionWithSigner[] = []
        const methodCalls = new Map<number, algosdk.ABIMethod>();

        this.txns.forEach((txn) => {
            if (txn.type === 'txnWithSigner') {
                txnWithSigners.push(txn);
                return;
            }

            if (txn.type === 'atc') {
                this.buildAtc(txn.atc, txnWithSigners, methodCalls);
                return;
            }

            const signer = txn.signer ?? this.getSigner(txn.from);

            if (txn.type === 'pay') {
                const payment = this.buildPayment(txn, suggestedParams);
                txnWithSigners.push({ txn: payment, signer });
            } else if (txn.type === 'assetCreate') {
                const assetCreate = this.buildAssetCreate(txn, suggestedParams);
                txnWithSigners.push({ txn: assetCreate, signer });
            }
        });

        txnWithSigners.forEach((ts) => {
            this.atc.addTransaction(ts);
        });

        const builtGroup = this.atc.buildGroup();

        this.atc['methodCalls'] = methodCalls;

        return builtGroup;
    }

    async execute() {
        await this.buildGroup()
        return await algokit.sendAtomicTransactionComposer({ atc: this.atc }, this.algod);
    }
}

export default class Client {
    algod: algosdk.Algodv2;

    signers: { [address: string]: algosdk.TransactionSigner } = {};

    cachedSuggestedParamsTimeout: number = 3000 // three seconds

    cachedSuggestedParams?: { params: algosdk.SuggestedParams, time: number }

    constructor({ algodClient }: { algodClient: algosdk.Algodv2; }) {
        this.algod = algodClient;
    }

    async getSuggestedParams() {
        if (this.cachedSuggestedParams && Date.now() - this.cachedSuggestedParams.time < this.cachedSuggestedParamsTimeout) {
            return this.cachedSuggestedParams.params;
        }

        const params = await this.algod.getTransactionParams().do();
        this.cachedSuggestedParams = { params, time: Date.now() };

        return params;
    }

    newGroup(groupName?: string) {
        return new ATCWrapper(
            this.algod,
            (addr: string) => this.signers[addr],
            () => this.getSuggestedParams()
        );
    }
}