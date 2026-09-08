"""Auth-related URL routes.

Wires up the 6 authentication endpoints under /api/auth/.
"""

from django.urls import path

from .views import (
    LoginView,
    MeView,
    OTPResendView,
    OTPVerifyView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,

)

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("otp/verify/", OTPVerifyView.as_view(), name="otp-verify"),
    path("otp/resend/", OTPResendView.as_view(), name="otp-resend"),
    path("password-reset/request/", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("password-change/", PasswordChangeView.as_view(), name="password-change"),
    path("me/", MeView.as_view(), name="me"),

]
