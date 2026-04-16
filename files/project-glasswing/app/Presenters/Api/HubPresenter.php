<?php

declare(strict_types=1);

namespace App\Presenters\Api;

use App\Model\ServiceRegistry;

/**
 * GET /api/v1/hub/services       — full registry (no auth required; same content
 *                                  as ~/projects/default/service-registry.json)
 * GET /api/v1/hub/health          — live probe of every registered service
 * GET /api/v1/hub/health?url=...  — probe a single URL
 *
 * Both routes are public (listed in publicActions) because the data they
 * expose is non-sensitive (service names, public hostnames, ports). Nginx
 * still gates access at the domain level via Authentik proxy auth, so outside
 * callers cannot hit these endpoints without first authenticating to the SSO.
 */
final class HubPresenter extends BaseApiPresenter
{
	/** @var array<int,string> */
	protected array $publicActions = ['services', 'health'];

	/** @inject */
	public ServiceRegistry $registry;

	public function actionServices(): void
	{
		$this->requireMethod('GET');
		$data = $this->registry->read();
		$this->sendSuccess($data);
	}

	public function actionHealth(): void
	{
		$this->requireMethod('GET');
		$url = $this->getHttpRequest()->getQuery('url');

		if (is_string($url) && $url !== '') {
			// Only allow probing URLs that exist in the registry — prevents SSRF
			// via this endpoint (attacker coercing glasswing to hit arbitrary
			// internal IPs).
			if (!$this->isRegisteredUrl($url)) {
				$this->sendError('URL not in registry', 400);
			}
			$result = $this->registry->probe($url);
			$this->sendSuccess(['url' => $url, 'health' => $result]);
		}

		$all = $this->registry->probeAll();
		$out = [];
		foreach ($all as $probedUrl => $result) {
			$out[] = [
				'url' => $probedUrl,
				'status' => $result['status'],
				'http_code' => $result['http_code'],
				'ms' => $result['ms'],
			];
		}
		$this->sendSuccess([
			'generated_at' => gmdate('c'),
			'probes' => $out,
		]);
	}

	private function isRegisteredUrl(string $url): bool
	{
		foreach ($this->registry->read()['services'] as $svc) {
			foreach (['url', 'ip_url', 'domain_url', 'primary_url'] as $key) {
				if (isset($svc[$key]) && $svc[$key] === $url) {
					return true;
				}
			}
		}
		return false;
	}
}
