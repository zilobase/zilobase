{{- define "zilobase.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "zilobase.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "zilobase.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "zilobase.labels" -}}
app.kubernetes.io/name: {{ include "zilobase.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "zilobase.selectorLabels" -}}
app.kubernetes.io/name: {{ include "zilobase.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "zilobase.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "zilobase.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "zilobase.image" -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest }}
{{- end }}

{{- define "zilobase.migrationEnv" -}}
- name: DATABASE_URL
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret | quote }}, key: {{ .Values.secretKeys.databaseUrl | quote }} } }
- { name: DRIZZLE_MIGRATIONS_DIR, value: "/app/apps/server/drizzle" }
{{- end }}

{{- define "zilobase.env" -}}
- name: DATABASE_URL
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret | quote }}, key: {{ .Values.secretKeys.databaseUrl | quote }} } }
- name: BETTER_AUTH_SECRET
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret | quote }}, key: {{ .Values.secretKeys.betterAuthSecret | quote }} } }
- name: ZILOBASE_BOOTSTRAP_TOKEN
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret | quote }}, key: {{ .Values.secretKeys.bootstrapToken | quote }} } }
- name: S3_ACCESS_KEY_ID
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret | quote }}, key: {{ .Values.secretKeys.s3AccessKeyId | quote }} } }
- name: S3_SECRET_ACCESS_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret | quote }}, key: {{ .Values.secretKeys.s3SecretAccessKey | quote }} } }
- name: SMTP_PASSWORD
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret | quote }}, key: {{ .Values.secretKeys.smtpPassword | quote }}, optional: true } }
{{- if .Values.gmail.enabled }}
- name: GMAIL_GOOGLE_CLIENT_SECRET
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret | quote }}, key: {{ .Values.secretKeys.gmailGoogleClientSecret | quote }} } }
- name: GMAIL_TOKEN_ENCRYPTION_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret | quote }}, key: {{ .Values.secretKeys.gmailTokenEncryptionKey | quote }} } }
{{- end }}
{{- if .Values.realtime.enabled }}
- name: REALTIME_REDIS_URL
  valueFrom: { secretKeyRef: { name: {{ .Values.realtime.existingSecret | quote }}, key: {{ .Values.realtime.secretKey | quote }} } }
{{- end }}
{{- if .Values.trustedCa.configMapName }}
- { name: NODE_EXTRA_CA_CERTS, value: "/etc/zilobase/trusted-ca/ca.crt" }
{{- end }}
- { name: HOST, value: "0.0.0.0" }
- { name: PORT, value: "3000" }
- { name: NODE_ENV, value: "production" }
- { name: BETTER_AUTH_URL, value: {{ .Values.config.externalUrl | quote }} }
- { name: CLIENT_URL, value: {{ .Values.config.externalUrl | quote }} }
- { name: IMAGE_STORAGE_MODE, value: "s3" }
- { name: S3_ENDPOINT, value: {{ .Values.config.s3Endpoint | quote }} }
- { name: S3_PUBLIC_ENDPOINT, value: {{ .Values.config.s3PublicEndpoint | quote }} }
- { name: S3_BUCKET_NAME, value: {{ .Values.config.s3Bucket | quote }} }
- { name: EMAIL_FROM, value: {{ .Values.config.emailFrom | quote }} }
- { name: SMTP_HOST, value: {{ .Values.config.smtpHost | quote }} }
- { name: SMTP_PORT, value: {{ .Values.config.smtpPort | quote }} }
- { name: SMTP_SECURE, value: {{ .Values.config.smtpSecure | quote }} }
- { name: SMTP_USER, value: {{ .Values.config.smtpUser | quote }} }
{{- if .Values.gmail.enabled }}
- { name: GMAIL_GOOGLE_CLIENT_ID, value: {{ .Values.gmail.googleClientId | quote }} }
- { name: GMAIL_PUBSUB_TOPIC, value: {{ .Values.gmail.pubsubTopic | quote }} }
- { name: GMAIL_PUBSUB_PUSH_AUDIENCE, value: {{ .Values.gmail.pubsubPushAudience | quote }} }
- { name: GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL, value: {{ .Values.gmail.pubsubServiceAccountEmail | quote }} }
- { name: GMAIL_PUBSUB_SUBSCRIPTION, value: {{ .Values.gmail.pubsubSubscription | quote }} }
{{- end }}
- { name: DRIZZLE_MIGRATIONS_DIR, value: "/app/apps/server/drizzle" }
{{- end }}
