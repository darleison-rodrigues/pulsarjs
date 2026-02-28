import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { Env, TelemetryEvent } from '../types';
import { classify, RulePayload } from '../lib/rule-engine';
import { sendSlackAlert } from '../lib/slack';

export class AlertWorkflow extends WorkflowEntrypoint<Env, TelemetryEvent[]> {
    async run(event: WorkflowEvent<TelemetryEvent[]>, step: WorkflowStep) {
        const payloads = event.payload;

        for (const payload of payloads) {
            // Step 1: Classification (Deterministic)
            const classification = await step.do('classify-event', async () => {
                const rulePayload: RulePayload = {
                    error_type: payload.error_type,
                    message: payload.message,
                    status_code: payload.status_code,
                    api_endpoint: payload.url || (payload.metadata?.endpoint),
                    storefront_type: payload.storefront_type
                };
                return classify(rulePayload);
            });

            // Step 2: Alerting (Slack)
            if (classification.severity === 'critical' || classification.severity === 'high') {
                await step.do('send-slack-alert', {
                    retries: {
                        limit: 3,
                        delay: 1000,
                        backoff: 'exponential'
                    }
                }, async () => {
                    await sendSlackAlert(this.env, {
                        pattern: classification.pattern,
                        severity: classification.severity,
                        message: payload.message,
                        url: payload.url,
                        reasoning: classification.reasoning,
                        clientId: payload.client_id
                    });
                });
            }

            // Step 3: Record Alert in D1
            if (classification.severity !== 'low') {
                await step.do('record-alert-in-d1', async () => {
                    await this.env.DB.prepare(
                        'INSERT INTO alerts (client_id, site_id, pattern, severity, message, url, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                    ).bind(
                        payload.client_id,
                        payload.site_id,
                        classification.pattern,
                        classification.severity,
                        payload.message.substring(0, 255),
                        payload.url,
                        payload.session_id,
                        new Date().toISOString()
                    ).run();
                });
            }
        }
    }
}
