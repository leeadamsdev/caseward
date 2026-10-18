@extends('mail.layout')

@section('title', 'Your password was reset')
@section('preheader', 'Your Caseward password has changed. If this was you, no further action is needed.')
@section('eyebrow', 'ACCOUNT SECURITY')
@section('subtitle', 'A security update for your account.')
@section('intro')
    The password for this Caseward account was reset on <strong>{{ $resetAt }}</strong>:
@endsection

@section('before-action')
    <p style="margin:0 0 12px;">If this was you, no further action is needed.</p>
    <p style="margin:0;">If you didn’t reset your password, request a new reset link immediately to secure your account.</p>
@endsection

@section('notice')
    <strong>Existing sessions have been signed out.</strong><br>
    Sign in again using the password you just set when you’re ready.
@endsection

@section('footer', 'If you suspect someone has access to your email inbox, secure your email account as well.')
