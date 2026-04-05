#!/usr/bin/env python3
from datetime import datetime, timedelta
from app.db.session import SessionLocal
from app.models.models import MarketplaceOrder, SellerPayoutProfile, PayoutHistory
from app.api.routes import _notify_user, _calculate_payouts

CHECK_INTERVAL_SECONDS = 900


def notify(session, user_id, title, message):
    _notify_user(session, user_id, title, message)


def release_funds(session, order, reason):
    now = datetime.utcnow()
    order.status = 'completed'
    order.fulfillment_status = 'COMPLETED'
    order.payout_status = 'PAYOUT_SENT'
    platform_fee_amount, seller_payout_amount = _calculate_payouts(order)
    order.platform_fee_amount = platform_fee_amount
    order.seller_payout_amount = seller_payout_amount
    order.funds_release_at = now
    order.escrow_status = 'RELEASED'
    payout = session.query(SellerPayoutProfile).filter(
        SellerPayoutProfile.user_id == order.seller_id,
        SellerPayoutProfile.is_verified == True
    ).first()
    if payout:
        reference = f"AUTO-{order.id}-{int(now.timestamp())}"
        session.add(PayoutHistory(
            order_id=order.id,
            seller_id=order.seller_id,
            payout_profile_id=payout.id,
            amount=order.seller_payout_amount,
            currency=order.currency or 'GHS',
            status='AUTO_RELEASED',
            reference=reference,
            receipt_note=reason
        ))
    notify(session, order.seller_id, 'Payout released', f'Order #{order.id} completed; seller receives {order.seller_payout_amount} {order.currency} after an 8% platform fee ({order.platform_fee_amount}). ({reason}).')
    notify(session, order.buyer_id, 'Order completed', f'Order #{order.id} is complete. Funds released to the seller ({reason}).')


def refund_order(session, order, reason):
    order.status = 'refunded'
    order.fulfillment_status = 'REFUNDED'
    order.payment_status = 'REFUNDED'
    order.escrow_status = 'REFUNDED'
    notify(session, order.buyer_id, 'Order refunded', f'Order #{order.id} was refunded: {reason}')
    notify(session, order.seller_id, 'Order refunded', f'Order #{order.id} was refunded due to {reason}.')


def run_checks():
    now = datetime.utcnow()
    with SessionLocal() as session:
        orders = session.query(MarketplaceOrder).all()
        changed = False
        for order in orders:
            if order.status == 'paid' and order.seller_ship_deadline and order.seller_ship_deadline < now:
                refund_order(session, order, 'seller missed the 5-day shipping deadline')
                changed = True
                continue
            if order.status == 'delivered' and order.funds_release_at and order.funds_release_at <= now:
                release_funds(session, order, 'standard 24h release window')
                changed = True
                continue
            if order.status == 'shipped' and order.shipped_at and order.shipped_at + timedelta(days=7) <= now:
                release_funds(session, order, 'automatic release after 7 days without buyer confirmation')
                changed = True
        if changed:
            session.commit()


if __name__ == '__main__':
    run_checks()
