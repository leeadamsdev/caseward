@extends('mail.layout')

@section('title', 'You have been invited')
@section('preheader', 'Join your colleagues on Caseward. Sign in or create an account to accept your invitation.')
@section('eyebrow', 'WORKSPACE INVITATION')
@section('subtitle', 'Work together with your team.')
@section('intro')
    You have been invited to join <strong>{{ $workspaceName }}</strong> as a member using this email address:
@endsection

@section('notice')
    <strong>This invitation expires on {{ $expiresAt }}.</strong><br>
    Sign in or create an account with this email address and verify it before accepting. Opening this link does not join the workspace automatically.
@endsection

@section('footer', 'If you were not expecting this invitation, you can ignore this email.')
