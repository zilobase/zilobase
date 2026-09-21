use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopServer {
    pub instance_id: String,
    pub display_name: String,
    pub issuer: String,
    pub web_origin: String,
    pub api_origin: String,
    pub protocol_version: u8,
    pub server_version: String,
    pub minimum_desktop_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DiscoveryDocument {
    #[serde(flatten)]
    pub(super) server: DesktopServer,
    pub(super) desktop_authorization: DesktopAuthorizationEndpoints,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DesktopAuthorizationEndpoints {
    pub(super) authorization_endpoint: String,
    pub(super) token_endpoint: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopServerWorkspaceSnapshot {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DesktopServerProfile {
    pub(super) server: DesktopServer,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) last_active_workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) last_path: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) workspaces: Vec<DesktopServerWorkspaceSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) last_used_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DesktopServerConfig {
    pub(super) version: u8,
    pub(super) active_instance_id: String,
    pub(super) profiles: Vec<DesktopServerProfile>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopServerProfileView {
    pub server: DesktopServer,
    pub last_active_workspace_id: Option<String>,
    pub last_path: Option<String>,
    pub workspaces: Vec<DesktopServerWorkspaceSnapshot>,
    pub last_used_at: Option<String>,
    pub has_credentials: bool,
    pub active: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopServerProfileList {
    pub active_instance_id: String,
    pub profiles: Vec<DesktopServerProfileView>,
}
