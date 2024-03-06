import algosdk, { makeApplicationCallTxnFromObject, makeApplicationCreateTxn, makeApplicationCreateTxnFromObject } from 'algosdk'
import * as algokit from '@algorandfoundation/algokit-utils'

type CommonTxnParams = {
    sender: string
    signer?: algosdk.TransactionSigner
    rekeyTo?: string
    note?: Uint8Array
    lease?: Uint8Array
    /** The tranasction fee. In most cases you want to use `extraFee` unless setting the fee to 0 to be covered by another transaction */
    flatFee?: number
    /** The fee to pay IN ADDITION to the suggested fee. Useful for covering inner tranasction fees */
    extraFee?: number
}

type PayTxnParams = CommonTxnParams & {
    to: string
    amount: number
}

type AssetCreateParams = CommonTxnParams & {
    total: number
    decimals?: number
    defaultFrozen?: boolean
    manager?: string
    reserve?: string
    freeze?: string
    clawback?: string
    unitName?: string
    assetName?: string
    url?: string
    metadataHash?: Uint8Array
}

type AssetConfigParams = CommonTxnParams & {
    assetID: number
    manager?: string
    reserve?: string
    freeze?: string
    clawback?: string
}

type AssetFreezeParams = CommonTxnParams & {
    assetID: number
    account: string
    frozen: boolean
}

type AssetDestroyParams = CommonTxnParams & {
    assetID: number
}

type KeyRegParams = CommonTxnParams & {
    voteKey?: Uint8Array
    selectionKey?: Uint8Array
    voteFirst: number
    voteLast: number
    voteKeyDilution: number
    nonParticipation: boolean
    stateProofKey?: Uint8Array
}

type AssetTransferParams = CommonTxnParams & {
    assetID: number
    amount: number
    to: string
    clawbackTarget?: string
    closeAssetTo?: string
}

type AppCallParams = CommonTxnParams & {
    onComplete: algosdk.OnApplicationComplete
    appID?: number
    approvalProgram?: Uint8Array
    clearProgram?: Uint8Array
    schema?: {
        globalUints: number
        globalByteSlices: number
        localUints: number
        localByteSlices: number
    }
    appArgs?: Uint8Array[]
    accountReferences?: string[]
    appReferences?: number[]
    assetReferences?: number[]
    extraPages?: number
    boxReferences?: algosdk.BoxReference[]
}

type Txn =
    (PayTxnParams & { type: 'pay' })
    | (AssetCreateParams & { type: 'assetCreate' })
    | (AssetConfigParams & { type: 'assetConfig' })
    | (AssetFreezeParams & { type: 'assetFreeze' })
    | (AssetDestroyParams & { type: 'assetDestroy' })
    | (AssetTransferParams & { type: 'assetTransfer' })
    | (AppCallParams & { type: 'appCall' })
    | (KeyRegParams & { type: 'keyReg' })
    | (algosdk.TransactionWithSigner & { type: 'txnWithSigner' })
    | { atc: algosdk.AtomicTransactionComposer, type: 'atc' }

class AlgokitComposer {
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

    addPayment(params: PayTxnParams): AlgokitComposer {
        this.txns.push({ ...params, type: 'pay' });

        return this
    }

    addAssetCreate(params: AssetCreateParams): AlgokitComposer {
        this.txns.push({ ...params, type: 'assetCreate' });

        return this
    }

    addAssetConfig(params: AssetConfigParams): AlgokitComposer {
        this.txns.push({ ...params, type: 'assetConfig' });

        return this
    }

    addAssetFreeze(params: AssetFreezeParams): AlgokitComposer {
        this.txns.push({ ...params, type: 'assetFreeze' });

        return this
    }

    addAssetDestroy(params: AssetDestroyParams): AlgokitComposer {
        this.txns.push({ ...params, type: 'assetDestroy' });

        return this
    }

    addAssetTransfer(params: AssetTransferParams): AlgokitComposer {
        this.txns.push({ ...params, type: 'assetTransfer' });

        return this
    }

    addAppCall(params: AppCallParams): AlgokitComposer {
        this.txns.push({ ...params, type: 'appCall' });

        return this
    }

    addKeyReg(params: KeyRegParams): AlgokitComposer {
        this.txns.push({ ...params, type: 'keyReg' });

        return this
    }

    addAtc(atc: algosdk.AtomicTransactionComposer): AlgokitComposer {
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

    private commonTxnBuildStep(params: CommonTxnParams, txn: algosdk.Transaction, suggestedParams: algosdk.SuggestedParams) {
        if (params.lease) txn.addLease(params.lease);
        if (params.rekeyTo) txn.addRekey(params.rekeyTo);
        if (params.note) txn.note = params.note;

        if (params.flatFee !== undefined && params.extraFee !== undefined) {
            throw Error('Cannot set both flatFee and extraFee')
        }

        if (params.flatFee) {
            txn.fee = params.flatFee;
        } else {
            txn.fee = (txn.estimateSize() * suggestedParams.fee) || algosdk.ALGORAND_MIN_TX_FEE
            if (params.extraFee) txn.fee += params.extraFee;
        }

        return txn
    }

    private buildPayment(params: PayTxnParams, suggestedParams: algosdk.SuggestedParams) {
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: params.sender,
            to: params.to,
            amount: params.amount,
            suggestedParams,
        });

        return this.commonTxnBuildStep(params, txn, suggestedParams)
    }

    private buildAssetCreate(params: AssetCreateParams, suggestedParams: algosdk.SuggestedParams) {
        const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
            from: params.sender,
            total: params.total,
            decimals: params.decimals ?? 0,
            suggestedParams,
            defaultFrozen: params.defaultFrozen ?? false
        });

        return this.commonTxnBuildStep(params, txn, suggestedParams)
    }

    private buildAppCall(params: AppCallParams, suggestedParams: algosdk.SuggestedParams) {
        const sdkParams = {
            from: params.sender,
            suggestedParams,
            onComplete: params.onComplete,
            approvalProgram: params.approvalProgram,
            clearProgram: params.clearProgram,
            appArgs: params.appArgs,
            accounts: params.accountReferences,
            foreignApps: params.appReferences,
            foreignAssets: params.assetReferences,
            extraPages: params.extraPages,
            numLocalInts: params.schema?.localUints || 0,
            numLocalByteSlices: params.schema?.localByteSlices || 0,
            numGlobalInts: params.schema?.globalUints || 0,
            numGlobalByteSlices: params.schema?.globalByteSlices || 0,
        }

        let txn: algosdk.Transaction;

        if (!params.appID) {
            if (params.approvalProgram === undefined || params.clearProgram === undefined) {
                throw new Error('approvalProgram and clearProgram are required for application creation');
            }

            txn = makeApplicationCreateTxnFromObject({ ...sdkParams, approvalProgram: params.approvalProgram, clearProgram: params.clearProgram })
        }

        txn = makeApplicationCallTxnFromObject({ ...sdkParams, appIndex: params.appID! })

        return this.commonTxnBuildStep(params, txn, suggestedParams)
    }

    private buildAssetConfig(params: AssetConfigParams, suggestedParams: algosdk.SuggestedParams) {
        const txn = algosdk.makeAssetConfigTxnWithSuggestedParamsFromObject({
            from: params.sender,
            assetIndex: params.assetID,
            suggestedParams,
            manager: params.manager,
            reserve: params.reserve,
            freeze: params.freeze,
            clawback: params.clawback,
            strictEmptyAddressChecking: false,
        });

        return this.commonTxnBuildStep(params, txn, suggestedParams)
    }

    private buildAssetDestroy(params: AssetDestroyParams, suggestedParams: algosdk.SuggestedParams) {
        const txn = algosdk.makeAssetDestroyTxnWithSuggestedParamsFromObject({
            from: params.sender,
            assetIndex: params.assetID,
            suggestedParams,
        });

        return this.commonTxnBuildStep(params, txn, suggestedParams)
    }

    private buildAssetFreeze(params: AssetFreezeParams, suggestedParams: algosdk.SuggestedParams) {
        const txn = algosdk.makeAssetFreezeTxnWithSuggestedParamsFromObject({
            from: params.sender,
            assetIndex: params.assetID,
            freezeTarget: params.account,
            freezeState: params.frozen,
            suggestedParams,
        });

        return this.commonTxnBuildStep(params, txn, suggestedParams)
    }

    private buildAssetTransfer(params: AssetTransferParams, suggestedParams: algosdk.SuggestedParams) {
        const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: params.sender,
            to: params.to,
            assetIndex: params.assetID,
            amount: params.amount,
            suggestedParams,
            closeRemainderTo: params.closeAssetTo,
            revocationTarget: params.clawbackTarget,
        });

        return this.commonTxnBuildStep(params, txn, suggestedParams)
    }

    private buildKeyReg(params: KeyRegParams, suggestedParams: algosdk.SuggestedParams) {
        let txn: algosdk.Transaction;

        if (params.nonParticipation) {
            txn = algosdk.makeKeyRegistrationTxnWithSuggestedParams(
                params.sender,
                params.note,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                suggestedParams,
                params.rekeyTo,
                true,
                undefined,
            )
        } else {
            txn = algosdk.makeKeyRegistrationTxnWithSuggestedParams(
                params.sender,
                params.note,
                params.voteKey!,
                params.selectionKey!,
                params.voteFirst,
                params.voteLast,
                params.voteKeyDilution,
                suggestedParams,
                params.rekeyTo,
                false,
                params.stateProofKey
            )
        }

        return this.commonTxnBuildStep(params, txn, suggestedParams)
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

            const signer = txn.signer ?? this.getSigner(txn.sender);

            if (txn.type === 'pay') {
                const payment = this.buildPayment(txn, suggestedParams);
                txnWithSigners.push({ txn: payment, signer });
            } else if (txn.type === 'assetCreate') {
                const assetCreate = this.buildAssetCreate(txn, suggestedParams);
                txnWithSigners.push({ txn: assetCreate, signer });
            } else if (txn.type === 'appCall') {
                const appCall = this.buildAppCall(txn, suggestedParams);
                txnWithSigners.push({ txn: appCall, signer });
            } else if (txn.type === 'assetConfig') {
                const assetConfig = this.buildAssetConfig(txn, suggestedParams);
                txnWithSigners.push({ txn: assetConfig, signer });
            } else if (txn.type === 'assetDestroy') {
                const assetDestroy = this.buildAssetDestroy(txn, suggestedParams);
                txnWithSigners.push({ txn: assetDestroy, signer });
            } else if (txn.type === 'assetFreeze') {
                const assetFreeze = this.buildAssetFreeze(txn, suggestedParams);
                txnWithSigners.push({ txn: assetFreeze, signer });
            } else if (txn.type === 'assetTransfer') {
                const assetTransfer = this.buildAssetTransfer(txn, suggestedParams);
                txnWithSigners.push({ txn: assetTransfer, signer });
            } else if (txn.type === 'keyReg') {
                const keyReg = this.buildKeyReg(txn, suggestedParams);
                txnWithSigners.push({ txn: keyReg, signer });
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
        return await algokit.sendAtomicTransactionComposer({ atc: this.atc, sendParams: { suppressLog: true } }, this.algod);
    }
}

export default class AlgokitClient {
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
        return new AlgokitComposer(
            this.algod,
            (addr: string) => this.signers[addr],
            () => this.getSuggestedParams()
        );
    }

    sendPayment(params: PayTxnParams) {
        return this.newGroup().addPayment(params).execute();
    }

    sendAssetCreate(params: AssetCreateParams) {
        return this.newGroup().addAssetCreate(params).execute();
    }
}