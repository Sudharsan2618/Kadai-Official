"""Razorpay credentials + the single product plan.

Price is configurable end to end: change PLAN_PRICE_INR and checkout,
invoices and the pricing page all follow."""
from pydantic import Field

from .base import SettingsGroup


class BillingSettings(SettingsGroup):
    razorpay_key_id: str = Field(default="", validation_alias="RAZORPAY_KEY_ID")
    razorpay_key_secret: str = Field(default="", validation_alias="RAZORPAY_KEY_SECRET")
    razorpay_webhook_secret: str = Field(default="", validation_alias="RAZORPAY_WEBHOOK_SECRET")
    razorpay_timeout: int = Field(default=20, validation_alias="RAZORPAY_TIMEOUT")

    plan_id: str = Field(default="kadai_monthly", validation_alias="PLAN_ID")
    plan_name: str = Field(default="Kadai Monthly", validation_alias="PLAN_NAME")
    plan_price_inr: int = Field(default=1500, validation_alias="PLAN_PRICE_INR")
    plan_currency: str = Field(default="INR", validation_alias="PLAN_CURRENCY")
    plan_period_days: int = Field(default=30, validation_alias="PLAN_PERIOD_DAYS")
    trial_days: int = Field(default=14, validation_alias="TRIAL_DAYS")

    @property
    def configured(self) -> bool:
        return bool(self.razorpay_key_id and self.razorpay_key_secret)

    def plan_public(self) -> dict:
        """Everything the frontend needs to render pricing + open checkout."""
        return {
            "id": self.plan_id,
            "name": self.plan_name,
            "price_inr": self.plan_price_inr,
            "amount_paise": self.plan_price_inr * 100,
            "currency": self.plan_currency,
            "period_days": self.plan_period_days,
            "trial_days": self.trial_days,
            "razorpay_key_id": self.razorpay_key_id,
        }
