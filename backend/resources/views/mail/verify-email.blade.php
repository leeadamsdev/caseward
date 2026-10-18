@extends('mail.layout')

@section('title', 'Verify your email')
@section('preheader', 'Confirm your email address to get started with Caseward. Your link expires in 1 hour.')
@section('eyebrow', 'EMAIL VERIFICATION')
@section('subtitle', 'One quick step to get started.')
@section('intro', 'Confirm this email address to finish setting up your Caseward account:')

@section('notice')
    <strong>This link expires in 1 hour.</strong><br>
    Opening it takes you to Caseward to confirm your address.
@endsection

@section('footer', 'If you didn’t create a Caseward account, you can ignore this email.')
