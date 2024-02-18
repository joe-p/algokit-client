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

type Txn = (PayTxnParams & { type: 'pay' }) | (AssetCreateParams & { type: 'assetCreate' })

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

        this.txns.forEach((txn) => {
            const signer = txn.signer ?? this.getSigner(txn.from);

            if (txn.type === 'pay') {
                const payment = this.buildPayment(txn, suggestedParams);
                this.atc.addTransaction({ txn: payment, signer });
            } else if (txn.type === 'assetCreate') {
                const assetCreate = this.buildAssetCreate(txn, suggestedParams);
                this.atc.addTransaction({ txn: assetCreate, signer });
            }
        });

        this.atc.buildGroup();

        return this;
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