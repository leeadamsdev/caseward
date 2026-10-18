@extends('mail.layout')

@section('title', 'Reset your password')
@section('preheader')
    Reset your Caseward password. Your link expires in {{ $expireMinutes }} minutes.
@endsection
@section('eyebrow', 'PASSWORD RECOVERY')
@section('subtitle', 'Get back into Caseward.')
@section('intro', 'We received a request to reset the password for your Caseward account:')

@section('notice')
    <strong>This link expires in {{ $expireMinutes }} minutes.</strong><br>
    You can use it once to choose a new password.
@endsection

@section('footer', 'If you didn’t request a password reset, you can ignore this email. Your password won’t change unless you complete the reset.')
