<?php
/**
 * PHP Proxy for FastAPI backend
 * Forwards all /api/* requests to localhost:8000
 */

// Get the request path after /api
$requestUri = $_SERVER['REQUEST_URI'];
$apiPath = preg_replace('/^\/api/', '', parse_url($requestUri, PHP_URL_PATH));
if (empty($apiPath)) $apiPath = '/';

// Whitelist allowed route prefixes to prevent SSRF
$allowedPrefixes = ['/upload/', '/analyze', '/report/', '/columns', '/health'];
$isAllowed = false;
foreach ($allowedPrefixes as $prefix) {
    if ($apiPath === $prefix || strpos($apiPath, $prefix) === 0) {
        $isAllowed = true;
        break;
    }
}

// Block requests with suspicious characters (SSRF vectors)
if ((!$isAllowed && $apiPath !== '/') || preg_match('/[@#]|:\/\/|\\\\|%0[dDaA]/', $apiPath)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Forbidden: invalid route']);
    exit;
}

// Reconstruct URL with only the validated path and original query string
$queryString = parse_url($requestUri, PHP_URL_QUERY);
$backendUrl = 'http://127.0.0.1:8000' . $apiPath . ($queryString ? '?' . $queryString : '');

// Get request method
$method = $_SERVER['REQUEST_METHOD'];

// Handle CORS preflight
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(200);
    exit;
}

// Initialize cURL
$ch = curl_init();

curl_setopt($ch, CURLOPT_URL, $backendUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 120);

// Forward only allowlisted headers
$allowedHeaders = ['content-type', 'accept', 'authorization'];
$headers = [];
foreach (getallheaders() as $name => $value) {
    $lower = strtolower($name);
    if (!in_array($lower, $allowedHeaders))
        continue;
    // Skip Content-Type for multipart uploads — let cURL set it with correct boundary
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if ($lower === 'content-type' && strpos($contentType, 'multipart/form-data') !== false)
        continue;
    $headers[] = "$name: $value";
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

// Handle different HTTP methods
if ($method === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    
    // Check if it's a file upload (multipart)
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    
    if (strpos($contentType, 'multipart/form-data') !== false) {
        // File upload - rebuild the multipart data
        $postData = [];
        foreach ($_FILES as $key => $file) {
            $postData[$key] = new CURLFile(
                $file['tmp_name'],
                $file['type'],
                $file['name']
            );
        }
        foreach ($_POST as $key => $value) {
            $postData[$key] = $value;
        }
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    } else {
        // JSON or other body
        $body = file_get_contents('php://input');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
} elseif ($method === 'PUT') {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
    $body = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
} elseif ($method === 'DELETE') {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
}

// Execute request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$responseContentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

if (curl_errno($ch)) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Backend unavailable']);
    curl_close($ch);
    exit;
}

curl_close($ch);

// Forward response
http_response_code($httpCode);
// Whitelist allowed response content types
$allowedContentTypes = ['application/json', 'application/pdf', 'text/csv'];
if ($responseContentType) {
    $typeAllowed = false;
    foreach ($allowedContentTypes as $allowed) {
        if (strpos($responseContentType, $allowed) !== false) {
            $typeAllowed = true;
            break;
        }
    }
    header('Content-Type: ' . ($typeAllowed ? $responseContentType : 'application/octet-stream'));
}
header('Access-Control-Allow-Origin: *');
header('X-Content-Type-Options: nosniff');

echo $response;
