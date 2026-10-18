<?php

declare(strict_types=1);

namespace App\Providers;

use App\Http\Middleware\StartSession;
use App\Session\CacheSessionHandler;
use Illuminate\Cache\RedisStore;
use Illuminate\Contracts\Cache\Factory as CacheFactory;
use Illuminate\Foundation\Application;
use Illuminate\Session\Middleware\StartSession as LaravelStartSession;
use Illuminate\Session\SessionManager;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Session;
use Illuminate\Support\ServiceProvider;
use LogicException;

class SessionServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(LaravelStartSession::class, fn (Application $app): StartSession => new StartSession(
            $app->make(SessionManager::class),
            fn (): CacheFactory => $app->make(CacheFactory::class),
        ));
    }

    public function boot(): void
    {
        Session::extend('redis', function (): CacheSessionHandler {
            $cache = clone Cache::store(Config::string('session.store'));
            $store = $cache->getStore();
            if (! $store instanceof RedisStore) {
                throw new LogicException('Caseward sessions require a Valkey cache store.');
            }
            $store->setConnection(Config::string('session.connection'));
            $store->setPrefix(Config::string('session.prefix'));

            return new CacheSessionHandler($cache, Config::integer('session.lifetime'));
        });
    }
}
