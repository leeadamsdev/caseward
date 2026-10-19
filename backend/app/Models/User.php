<?php

declare(strict_types=1);

namespace App\Models;

use App\Notifications\VerificationNotification;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $name
 * @property string $email
 * @property string $password
 * @property CarbonImmutable|null $email_verified_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class User extends Authenticatable implements MustVerifyEmail
{
    use Notifiable;

    protected $fillable = ['name', 'email', 'password'];

    protected $hidden = ['password'];

    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new VerificationNotification($this->getEmailForVerification()));
    }

    /** @return BelongsToMany<Workspace, $this, WorkspaceMembership, 'membership'> */
    public function workspaces(): BelongsToMany
    {
        return $this->belongsToMany(Workspace::class, 'workspace_memberships')
            ->using(WorkspaceMembership::class)
            ->as('membership')
            ->withPivot('role')
            ->withTimestamps();
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'immutable_datetime',
            'password' => 'hashed',
        ];
    }
}
