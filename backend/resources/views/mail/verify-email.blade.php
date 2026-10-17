<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Verify your email | Caseward</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f8fd;color:#151b38;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Confirm your email address to get started with Caseward. Your link expires in 1 hour.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f6f8fd;">
        <tr>
            <td align="center" style="padding:32px 12px;">
                <!--[if mso]><table role="presentation" width="560" align="center"><tr><td><![endif]-->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dfe5f0;border-radius:20px;">
                    <tr>
                        <td style="padding:32px 24px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center" style="padding-bottom:32px;">
                                        <img src="{{ $logoUrl }}" alt="Caseward" width="200" height="56" style="display:block;max-width:100%;height:auto;border:0;color:#151b38;font-size:26px;font-weight:bold;">
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding-bottom:8px;color:#326dd9;font-size:11px;font-weight:bold;letter-spacing:2px;">EMAIL VERIFICATION</td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding-bottom:10px;">
                                        <h1 style="margin:0;color:#151b38;font-size:28px;line-height:36px;font-weight:bold;">Verify your email</h1>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding-bottom:28px;color:#64708c;font-size:15px;line-height:24px;">One quick step to get started.</td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom:12px;font-size:15px;line-height:24px;">Confirm this email address to finish setting up your Caseward account:</td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom:28px;font-size:15px;line-height:24px;word-break:break-all;overflow-wrap:anywhere;"><strong>{{ $email }}</strong></td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding-bottom:24px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td align="center" bgcolor="#326dd9" style="border-radius:10px;background-color:#326dd9;background-image:linear-gradient(100deg,#326dd9,#6849d8);mso-padding-alt:15px 24px;">
                                                    <a href="{{ $actionUrl }}" style="display:block;padding:15px 24px;border-radius:10px;color:#ffffff;font-size:15px;line-height:22px;font-weight:bold;text-decoration:none;">{{ $actionText }}</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom:24px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#edf3ff;border-radius:12px;">
                                            <tr>
                                                <td style="padding:16px;font-size:14px;line-height:22px;">
                                                    <strong>This link expires in 1 hour.</strong><br>
                                                    Opening it takes you to Caseward to confirm your address.
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom:12px;color:#64708c;font-size:13px;line-height:21px;">If the button doesn’t work, copy and paste this link into your browser:</td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom:24px;font-size:13px;line-height:21px;word-break:break-all;overflow-wrap:anywhere;">
                                        <a href="{{ $actionUrl }}" style="color:#326dd9;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">{{ $actionUrl }}</a>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="border-top:1px solid #dfe5f0;padding-top:20px;color:#64708c;font-size:13px;line-height:21px;">If you didn’t create a Caseward account, you can ignore this email.</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
                <!--[if mso]></td></tr></table><![endif]-->
                <p style="margin:20px 0 0;color:#64708c;font-size:12px;line-height:20px;">Caseward</p>
            </td>
        </tr>
    </table>
</body>
</html>
