import { randomUUID } from 'node:crypto';
import { minorUnits, normalizeBuyer, normalizePurchaseRecovery, validReceiptToken, validRequestId } from '../shared/commerce.js';
import { cleanImg } from '../shared/portfolio.js';
import { hashToken, recoveryReceiptToken, validRecoveryReceipt, validSignature } from './paymentCrypto.js';
import { HttpError } from './http.js';

const completed = row => ['paid', 'free'].includes(row.status);
export function purchaseView(row) {
  return {
    id: row.id, requestId: row.request_id, title: row.item_title, kind: row.item_kind, itemId: row.item_id,
    amount: Number(row.amount), currency: row.currency, status: row.status, refundedAmount: Number(row.refunded_amount || 0),
    buyer: { name: row.buyer_name, email: row.buyer_email, phone: row.buyer_phone || '' },
    paymentId: row.razorpay_payment_id || null, createdAt: row.created_at, paidAt: row.paid_at || null,
    fulfillmentStatus: row.fulfillment_status || 'pending',
    downloadReady: completed(row) && row.delivery_kind !== 'service' && !!row.delivery_asset_id,
    deliveryKind: row.delivery_kind || 'file',
    ...(completed(row) ? { deliveryUrl: cleanImg(row.delivery_url) } : {}),
    ...(['pending', 'failed'].includes(row.status) && row.razorpay_order_id ? { razorpay: { orderId: row.razorpay_order_id, keyId: row.razorpay_key_id } } : {}),
  };
}

export function createPaymentService({ repo, gateway, clock = Date.now, receiptSigningKey = process.env.SESSION_SECRET }) {
  function receiptInput(input) {
    if (!validRequestId(input?.requestId) || !validReceiptToken(input?.receiptToken)) throw new HttpError(400, 'Invalid purchase receipt. Please start a new checkout.');
  }
  async function owner(slug, accountOnly = false) {
    if (typeof slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(slug)) throw new HttpError(404, 'Profile not found.');
    const value = await (accountOnly ? repo.accountOwner(slug) : repo.owner(slug));
    if (!value) throw new HttpError(404, 'Profile not found.');
    return value;
  }
  function checkToken(row, token) {
    if (row.receipt_token_hash !== hashToken(token) && !validRecoveryReceipt(row, token, receiptSigningKey)) throw new HttpError(403, 'Invalid purchase receipt.');
  }
  async function receipt(input) {
    receiptInput(input); const user = await owner(input.slug, true);
    const row = await repo.byRequest(user.id, input.requestId);
    if (!row) throw new HttpError(404, 'Purchase not found.');
    checkToken(row, input.receiptToken); return row;
  }
  function checkPayment(row, payment, id) {
    if (payment?.id !== id || payment.order_id !== row.razorpay_order_id || Number(payment.amount) !== Number(row.amount) || payment.currency !== row.currency) throw new HttpError(400, 'The payment does not match this order, amount or currency.');
  }
  async function finish(row, payment) {
    checkPayment(row, payment, payment?.id);
    if (payment.status !== 'captured') throw new HttpError(409, 'The payment has not been captured yet. Please check the receipt again in a moment.');
    return repo.complete({ ownerId: row.owner_id, purchaseId: row.id, orderId: row.razorpay_order_id, paymentId: payment.id, amount: Number(row.amount), currency: row.currency });
  }
  return {
    async recover(input, { ip = 'anon' } = {}) {
      const proof = normalizePurchaseRecovery(input);
      if (!proof.ok) throw new HttpError(400, 'Check your purchase details.', proof.errors);
      const ref = input?.item;
      if (!['offering', 'product'].includes(ref?.kind) || !/^[a-zA-Z0-9_-]{1,80}$/.test(String(ref?.id || ''))) throw new HttpError(400, 'Choose a valid shop item.');
      const user = await owner(input.slug, true);
      await repo.claim(user.id, 'checkout', ip);
      const { email, paymentId } = proof.value;
      const missing = () => new HttpError(404, 'No matching purchase was found for this item, email and payment ID. Check your original receipt or contact the profile owner.');
      const matches = row => row && row.owner_id === user.id && row.item_kind === ref.kind && String(row.item_id) === String(ref.id) && String(row.buyer_email || '').trim().toLowerCase() === email;
      let row = await repo.byPayment(user.id, paymentId);
      if (row && (!matches(row) || row.razorpay_payment_id !== paymentId)) throw missing();
      if (!row) {
        const account = await repo.sharedAccount();
        if (!account?.keyId || !account.keySecret) throw new HttpError(503, 'The profile owner needs to complete Razorpay setup before checking this payment.');
        const payment = await gateway.payment(account, paymentId);
        if (payment?.id !== paymentId || !/^order_[A-Za-z0-9]+$/.test(payment?.order_id || '')) throw missing();
        row = await repo.byOrder(user.id, payment.order_id);
        if (!matches(row)) throw missing();
        checkPayment(row, payment, paymentId);
        const refunded = Number(payment.amount_refunded ?? 0);
        if (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > Number(row.amount)) throw new HttpError(502, 'Payment refund status could not be read. Please try again.');
        if (refunded > 0 && refunded === Number(row.amount)) throw new HttpError(409, 'This payment has been refunded. Contact the profile owner for details.');
        if (['pending', 'failed'].includes(row.status)) row = await finish(row, payment);
        else if (row.razorpay_payment_id !== paymentId) throw missing();
      }
      if (!['paid', 'refunded'].includes(row.status)) throw missing();
      const receiptToken = recoveryReceiptToken(row, receiptSigningKey);
      return { ...purchaseView(row), receipt: { requestId: row.request_id, receiptToken } };
    },
    async create(input, { ip = 'anon' } = {}) {
      receiptInput(input);
      const buyer = normalizeBuyer(input?.buyer);
      if (!buyer.ok) throw new HttpError(400, 'Check your contact details.', buyer.errors);
      const ref = input?.item;
      if (!['offering', 'product'].includes(ref?.kind) || !/^[a-zA-Z0-9_-]{1,80}$/.test(String(ref?.id || ''))) throw new HttpError(400, 'Choose a valid shop item.');
      const user = await owner(input.slug);
      const previous = await repo.byRequest(user.id, input.requestId);
      if (previous) {
        checkToken(previous, input.receiptToken);
        if (previous.item_kind !== ref.kind || previous.item_id !== String(ref.id)) throw new HttpError(409, 'Start a new checkout for this item.');
        return purchaseView(previous);
      }
      const item = await repo.item(user.id, ref);
      if (!item || !['free', 'paid'].includes(item.pricing)) throw new HttpError(404, 'This shop item is no longer available.');
      const assetId = item.deliveryKind === 'service' ? null : item.assetId;
      const delivery = item.deliveryKind === 'service' ? '' : cleanImg(item.deliveryUrl);
      if (assetId) await repo.asset(user.id, assetId);
      const hosted = !!assetId || item.deliveryKind === 'service';
      if (!hosted && (!delivery || repo.hostedDeliveryOnly)) throw new HttpError(409, 'The delivery file for this item is not ready yet. Please contact the profile owner.');
      let amount;
      try { amount = item.pricing === 'free' ? 0 : minorUnits(item.amount, item.currency); }
      catch (error) { throw new HttpError(400, error.message); }
      const account = amount ? await repo.account(user.id) : null;
      if (amount && (!account?.enabled || !account.keyId || !account.keySecret)) throw new HttpError(503, 'Online payments are not available yet. Please contact this profile owner.');
      await repo.claim(user.id, 'checkout', ip);
      const id = randomUUID(), now = new Date(clock()).toISOString();
      const record = {
        id, owner_id: user.id, request_id: input.requestId, receipt_token_hash: hashToken(input.receiptToken),
        item_kind: ref.kind, item_id: String(ref.id), item_title: item.title, amount, currency: item.currency || 'INR',
        buyer_name: buyer.value.name, buyer_email: buyer.value.email, buyer_phone: buyer.value.phone,
        status: amount ? 'pending' : 'free', delivery_url: hosted ? '' : delivery,
        ...(hosted ? { delivery_asset_id: assetId || null, delivery_kind: item.deliveryKind || 'file' } : {}),
        fulfillment_status: !amount && (assetId || delivery) ? 'fulfilled' : 'pending',
        created_at: now, paid_at: amount ? null : now, refunded_amount: 0,
        razorpay_key_id: account?.keyId || null, payment_credentials: account ? repo.sealAccount(account, user.id, id) : null,
      };
      let row;
      try { row = await repo.insert(record); }
      catch (error) {
        if (error.code !== '23505') throw error;
        const existing = await repo.byRequest(user.id, input.requestId);
        if (!existing) throw error;
        checkToken(existing, input.receiptToken);
        if (existing.item_kind !== ref.kind || existing.item_id !== String(ref.id)) throw new HttpError(409, 'Start a new checkout for this item.');
        return purchaseView(existing);
      }
      if (!amount) return purchaseView(row);
      try {
        const order = await gateway.createOrder(account, { amount, currency: row.currency, receipt: id, notes: { purchase_id: id, owner_id: user.id } });
        if (!/^order_[A-Za-z0-9]+$/.test(order?.id || '') || Number(order.amount) !== amount || order.currency !== row.currency) throw new HttpError(502, 'Razorpay returned an order that does not match this purchase.');
        return purchaseView(await repo.attach(user.id, id, order.id));
      } catch (error) {
        try { await repo.fail(user.id, id); } catch (markError) { console.error('purchase-state', markError?.code || markError?.name); }
        throw error;
      }
    },
    async download(input) {
      const row = await receipt(input);
      if (!completed(row) || row.delivery_kind === 'service' || !row.delivery_asset_id) throw new HttpError(403, 'A completed purchase is required to download this file.');
      return repo.downloadAsset(row.owner_id, row.delivery_asset_id);
    },
    async status(input) {
      let row = await receipt(input);
      if (['pending', 'failed'].includes(row.status) && row.razorpay_order_id) {
        const account = await repo.purchaseAccount(row), payments = await gateway.orderPayments(account, row.razorpay_order_id);
        if (!Array.isArray(payments?.items)) throw new HttpError(502, 'Payment status could not be read. Please try again.');
        const payment = payments.items.find(p => p.status === 'captured');
        if (payment) {
          if (!/^pay_[A-Za-z0-9]+$/.test(payment.id || '')) throw new HttpError(502, 'Invalid payment reference.');
          row = await finish(row, payment);
        }
      }
      return purchaseView(row);
    },
    async verify(input) {
      const row = await receipt(input);
      if (row.status === 'free') return purchaseView(row);
      if (!row.razorpay_order_id || input.razorpay_order_id !== row.razorpay_order_id || !/^pay_[A-Za-z0-9]+$/.test(input.razorpay_payment_id || '')) throw new HttpError(400, 'The payment does not match this order.');
      const account = await repo.purchaseAccount(row);
      if (!validSignature(`${row.razorpay_order_id}|${input.razorpay_payment_id}`, input.razorpay_signature, account.keySecret)) throw new HttpError(400, 'Invalid payment signature.');
      if (row.status === 'paid' && row.razorpay_payment_id === input.razorpay_payment_id) return purchaseView(row);
      let payment = await gateway.payment(account, input.razorpay_payment_id);
      checkPayment(row, payment, input.razorpay_payment_id);
      if (payment.status === 'authorized') payment = await gateway.capture(account, payment.id, Number(row.amount), row.currency);
      checkPayment(row, payment, input.razorpay_payment_id);
      return purchaseView(await finish(row, payment));
    },
    async webhook({ body, signature }) {
      let data;
      try { data = JSON.parse(body); } catch { throw new HttpError(400, 'Invalid webhook body.'); }
      const payment = data?.payload?.payment?.entity, refund = data?.payload?.refund?.entity;
      const row = payment?.order_id ? await repo.webhookOrder(payment.order_id) : refund?.payment_id ? await repo.webhookPayment(refund.payment_id) : null;
      const account = row ? await repo.purchaseAccount(row) : await repo.sharedAccount();
      let signed = validSignature(body, signature, account?.webhookSecret);
      if (!signed && row) signed = validSignature(body, signature, (await repo.sharedAccount())?.webhookSecret);
      if (!signed) throw new HttpError(400, 'Invalid webhook signature.');
      if (!row) return { ok: true, ignored: true };
      if (data.event === 'payment.captured' || data.event === 'order.paid') {
        if (!/^pay_[A-Za-z0-9]+$/.test(payment?.id || '')) throw new HttpError(400, 'Invalid payment reference.');
        await finish(row, payment);
      } else if (data.event === 'payment.failed') {
        checkPayment(row, payment, payment?.id); await repo.fail(row.owner_id, row.id);
      } else if (data.event === 'refund.processed') {
        const current = await gateway.payment(account, refund.payment_id);
        checkPayment(row, current, row.razorpay_payment_id);
        const refunded = Number(current.amount_refunded);
        if (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > Number(row.amount)) throw new HttpError(400, 'Invalid refund amount.');
        await repo.refund(row.owner_id, row.id, refunded);
      }
      return { ok: true };
    },
  };
}
