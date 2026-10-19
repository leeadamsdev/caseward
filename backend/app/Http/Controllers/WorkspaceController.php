<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\WorkspaceRole;
use App\Http\Requests\CreateWorkspaceRequest;
use App\Http\Resources\WorkspaceResource;
use App\Models\User;
use App\Models\Workspace;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Header;
use Dedoc\Scramble\Attributes\QueryParameter;
use Dedoc\Scramble\Attributes\Response as ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use LogicException;

class WorkspaceController
{
    #[Endpoint(operationId: 'listWorkspaces', title: 'List your workspaces', description: 'Membership-scoped, ordered by name then ID, with 25 results per page.')]
    #[QueryParameter('page', type: 'int', default: 1, description: 'Page number, starting at one.')]
    public function index(Request $request): AnonymousResourceCollection
    {
        return WorkspaceResource::collection($this->user($request)->workspaces()
            ->orderBy('workspaces.name')->orderBy('workspaces.id')->paginate(25));
    }

    #[Endpoint(operationId: 'createWorkspace', title: 'Create a workspace', description: 'Creates the workspace and owner membership atomically. Bind account_id to the account shown by the form.')]
    #[ApiResponse(409, type: 'array{message: string, code: "account_context_changed"}')]
    #[Header('Location', type: 'string', required: true, status: 201, description: 'Relative API URL of the created workspace.')]
    #[Header('Cache-Control', type: '"no-store, private"', required: true, status: 201)]
    public function store(CreateWorkspaceRequest $request): JsonResponse
    {
        $user = $this->user($request);
        if ($request->integer('account_id') !== $user->id) {
            abort(response()->json([
                'message' => 'The signed-in account changed. Reopen the form before trying again.',
                'code' => 'account_context_changed',
            ], 409));
        }
        $workspace = DB::transaction(function () use ($request, $user): Workspace {
            $workspace = $user->workspaces()->create(
                ['name' => $request->string('name')->toString()],
                ['role' => WorkspaceRole::Owner],
            );

            // Pivot events can cancel a save without throwing; verify the membership before committing.
            return $user->workspaces()->find($workspace->id)
                ?? throw new LogicException('Workspace creation requires an owner membership.');
        });

        return (new WorkspaceResource($workspace))
            ->response()->setStatusCode(201)
            ->header('Cache-Control', 'no-store, private')
            ->header('Location', route('workspaces.show', ['workspace' => $workspace->id], absolute: false));
    }

    #[Endpoint(operationId: 'getWorkspace', title: 'Get a workspace', description: 'Unknown workspaces and workspaces without membership both return 404.')]
    public function show(Request $request, string $workspace): WorkspaceResource
    {
        // Scope before lookup so another tenant's ID is indistinguishable from an unknown ID.
        return new WorkspaceResource($this->user($request)->workspaces()->findOrFail($workspace));
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }
}
