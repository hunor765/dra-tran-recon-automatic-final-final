<?php
/**
 * PHP Proxy for FastAPI backend
 * Forwards /api.php?route=/upload/ga4 → http://127.0.0.1:8000/upload/ga4
 */

// Get the route from query parameter
$apiPath = $_GET['route'] ?? '/';

$backendUrl = 'http://127.0.0.1:8000' . $apiPath;

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
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 120);

// Forward headers
$headers = [];
foreach (getallheaders() as $name => $value) {
    if (strtolower($name) !== 'host' && strtolower($name) !== 'connection') {
        $headers[] = "$name: $value";
    }
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
    echo json_encode(['error' => 'Backend unavailable: ' . curl_error($ch)]);
    curl_close($ch);
    exit;
}

curl_close($ch);

// Forward response
http_response_code($httpCode);
if ($responseContentType) {
    header('Content-Type: ' . $responseContentType);
}
header('Access-Control-Allow-Origin: *');

echo $response;
