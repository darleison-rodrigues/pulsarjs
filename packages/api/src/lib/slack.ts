import { Env } from '../types';

export async function sendSlackAlert(env: Env, data: {
    pattern: string;
    severity: string;
    message: string;
    url: string;
    reasoning: string;
    clientId: string;
}) {
    if (!env.SLACK_WEBHOOK_URL) return;

    const color = data.severity === 'critical' ? '#FF0000' :
        data.severity === 'high' ? '#E8912D' : '#F2C744';

    const payload = {
        attachments: [
            {
                fallback: `Pulsar Alert: ${data.pattern} - ${data.severity}`,
                color: color,
                pretext: `*Pulsar Incident Detected*`,
                title: `${data.pattern} (${data.severity.toUpperCase()})`,
                text: data.reasoning,
                fields: [
                    {
                        title: "Client ID",
                        value: data.clientId,
                        short: true
                    },
                    {
                        title: "Target URL",
                        value: data.url,
                        short: true
                    },
                    {
                        title: "Raw Message",
                        value: data.message.substring(0, 100) + (data.message.length > 100 ? '...' : ''),
                        short: false
                    }
                ],
                footer: "PulsarJS | SFCC Observability",
                footer_icon: "https://pulsarjs.com/logo.png",
                ts: Math.floor(Date.now() / 1000)
            }
        ]
    };

    const res = await fetch(env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    return res.ok;
}
