<?php

declare(strict_types=1);

/**
 * Glasswing — Provision initial API token (called by Ansible).
 * Usage: php bin/provision-token.php --db=/path/to/glasswing.db --token=VALUE --name=NAME
 */

$dbPath = null;
$token = null;
$name = 'default';

foreach ($argv as $arg) {
	if (str_starts_with($arg, '--db=')) {
		$dbPath = substr($arg, 5);
	}
	if (str_starts_with($arg, '--token=')) {
		$token = substr($arg, 8);
	}
	if (str_starts_with($arg, '--name=')) {
		$name = substr($arg, 7);
	}
}

if (!$dbPath || !$token) {
	echo "Usage: php bin/provision-token.php --db=PATH --token=VALUE [--name=NAME]\n";
	exit(1);
}

if (!file_exists($dbPath)) {
	echo "Database not found: $dbPath\n";
	exit(1);
}

$db = new SQLite3($dbPath);
$db->enableExceptions(true);
$db->exec('PRAGMA journal_mode = WAL');

// Store SHA-256 hash, not plaintext
$hash = hash('sha256', $token);

// Check if token hash already exists
$checkStmt = $db->prepare('SELECT COUNT(*) FROM api_tokens WHERE token = :t');
$checkStmt->bindValue(':t', $hash);
$existing = $checkStmt->execute()->fetchArray()[0];

if ($existing > 0) {
	echo "Token already exists. Skipping.\n";
	$db->close();
	exit(0);
}

$stmt = $db->prepare('INSERT INTO api_tokens (token, name, created_by) VALUES (:t, :n, :c)');
$stmt->bindValue(':t', $hash);
$stmt->bindValue(':n', $name);
$stmt->bindValue(':c', 'ansible');
$stmt->execute();

$db->close();
echo "Created initial API token '$name'\n";
