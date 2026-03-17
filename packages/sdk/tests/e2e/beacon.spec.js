import { test, expect } from '@playwright/test';

test.describe('PulsarJS E2E Payload Verification', () => {
    test('SDK initialization sends valid payload via navigator.sendBeacon or fetch', async ({ page }) => {
        // Log console output from the browser
        // eslint-disable-next-line no-console
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

        // Navigate to our local test page where the SDK is injected
        await page.goto('http://localhost:3000/tests/e2e/test.html');

        // We will intercept the telemetry request (must be set up BEFORE navigation)
        const requestPromise = page.waitForRequest(request => {
            return request.url().includes('ingest') && request.method() === 'POST';
        }, { timeout: 10000 });

        // Navigate to our local test page where the SDK is injected
        await page.goto('http://localhost:3000/tests/e2e/test.html');

        // Check if the script loaded properly
        const isPulsarDefined = await page.evaluate(() => typeof window.Pulsar !== 'undefined');
        // eslint-disable-next-line no-console
        console.log('Is Pulsar defined?', isPulsarDefined);

        // Wait for the request to be captured
        const request = await requestPromise;

        // Parse the payload body
        // Note: sendBeacon is the primary transport and does not support custom
        // headers — client_id is verified inside the JSON body instead.
        const postData = request.postDataJSON();

        // Assert exactly what the payload should contain based on domain rules
        expect(postData).toHaveProperty('pulsar_version');
        expect(postData).toHaveProperty('client_id', 'test-client-id');
        expect(postData).toHaveProperty('site_id', 'test-site-id');
        expect(postData).toHaveProperty('timestamp');
        expect(postData).toHaveProperty('events');
        expect(Array.isArray(postData.events)).toBeTruthy();
        expect(postData.events.length).toBeGreaterThan(0);
        expect(postData).toHaveProperty('dropped_events', 0);

        // Verify that individual events have the correct schema
        const firstEvent = postData.events[0];
        expect(firstEvent).toHaveProperty('event_type');
        expect(firstEvent).toHaveProperty('session_id');
        expect(firstEvent).toHaveProperty('timestamp');
        expect(firstEvent).toHaveProperty('url');
    });
});
