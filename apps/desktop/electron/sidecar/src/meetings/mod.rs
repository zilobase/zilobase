pub mod audio;
pub mod capture;
pub mod recovery;

use serde::Serialize;
use std::{
    io::{self, Write},
    ops::Deref,
    path::PathBuf,
    sync::{Arc, Mutex},
};

#[derive(Clone)]
pub struct AppHandle {
    local_data_directory: PathBuf,
    output: Arc<Mutex<io::Stdout>>,
}

pub struct PathProvider<'a>(&'a PathBuf);

impl AppHandle {
    pub fn new(local_data_directory: PathBuf, output: Arc<Mutex<io::Stdout>>) -> Self {
        Self {
            local_data_directory,
            output,
        }
    }

    pub fn path(&self) -> PathProvider<'_> {
        PathProvider(&self.local_data_directory)
    }

    pub fn emit<T: Serialize>(&self, event: &str, payload: T) -> Result<(), String> {
        let line =
            serde_json::to_string(&serde_json::json!({ "event": event, "payload": payload }))
                .map_err(|_| "Could not serialize capture event".to_string())?;
        let mut output = self
            .output
            .lock()
            .map_err(|_| "Capture event output is unavailable")?;
        writeln!(output, "{line}")
            .and_then(|_| output.flush())
            .map_err(|_| "Could not write capture event".to_string())
    }
}

impl PathProvider<'_> {
    pub fn app_local_data_dir(&self) -> Result<PathBuf, String> {
        Ok(self.0.clone())
    }
}

pub struct State<'a, T>(&'a T);

impl<'a, T> State<'a, T> {
    pub fn new(value: &'a T) -> Self {
        Self(value)
    }
}

impl<T> Deref for State<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        self.0
    }
}
