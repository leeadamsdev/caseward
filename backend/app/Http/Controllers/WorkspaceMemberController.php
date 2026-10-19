<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Resources\WorkspaceMemberResource;
use App\Models\Workspace;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Header;
use Dedoc\Scramble\Attributes\QueryParameter;
use Dedoc\Scramble\Attributes\Response as ApiResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class WorkspaceMemberController
{
    #[Endpoint(operationId: 'listWorkspaceMembers', title: 'List workspace members', description: 'Owners and members can list colleagues in their workspace, ordered by name then account ID, with 25 results per page. Roles apply to this workspace. Unknown workspaces and workspaces without membership both return the same 404 response.')]
    #[QueryParameter('page', type: 'int', default: 1, description: 'Page number, starting at one.')]
    #[Header('Cache-Control', type: '"no-store, private"', required: true, status: 200)]
    #[ApiResponse(404, type: 'array{message: string}')]
    public function index(string $workspace): AnonymousResourceCollection
    {
        // Keep lookup behind email verification; implicit model binding runs earlier.
        $workspace = Workspace::query()->find($workspace) ?? abort(404, 'Not Found.');
        Gate::authorize('viewMembers', $workspace);

        return WorkspaceMemberResource::collection($workspace->users()
            ->orderBy('users.name')->orderBy('users.id')
            ->paginate(25, ['users.id', 'users.name', 'users.email']));
    }
}
