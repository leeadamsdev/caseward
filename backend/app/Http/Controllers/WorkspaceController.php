<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\WorkspaceRole;
use App\Http\Requests\CreateWorkspaceRequest;
use App\Http\Resources\WorkspaceResource;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use LogicException;

class WorkspaceController
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return WorkspaceResource::collection($this->user($request)->workspaces()
            ->orderBy('workspaces.name')->orderBy('workspaces.id')->paginate(25));
    }

    public function store(CreateWorkspaceRequest $request): JsonResponse
    {
        $user = $this->user($request);
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
