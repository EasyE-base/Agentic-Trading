use axum::{routing::{get, post}, Router, response::IntoResponse, extract::State, Json};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, net::SocketAddr, sync::{Arc, Mutex}};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone, Default)]
struct AppState {
    inner: Arc<Mutex<Memory>>,
}

#[derive(Default)]
struct Memory {
    positions: HashMap<String, i64>,
    fills: Vec<Fill>,
}

#[derive(Serialize, Deserialize, Clone)]
struct CallReq {
    tool: String,
    input: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone)]
struct SubmitOrderInput {
    symbol: String,
    side: String,
    qty: i64,
    price: Option<f64>,
    strategy_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SubmitOrderOutput {
    cl_ord_id: String,
    status: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct Fill {
    ts: String,
    cl_ord_id: String,
    exec_id: String,
    symbol: String,
    price: f64,
    qty: i64,
    venue: String,
}

async fn health() -> impl IntoResponse {
    axum::Json(serde_json::json!({"status":"ok"}))
}

async fn call(State(state): State<AppState>, Json(req): Json<CallReq>) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    match req.tool.as_str() {
        "broker-gateway.submit_order" => {
            let input: SubmitOrderInput = serde_json::from_value(req.input).map_err(|e| {
                (axum::http::StatusCode::BAD_REQUEST, format!("bad input: {e}"))
            })?;
            let cl_ord_id = format!("clo_{}", nanoid::nanoid!(8));
            let exec_id = format!("exe_{}", nanoid::nanoid!(8));
            let price = input.price.unwrap_or(100.0);
            let ts = chrono::Utc::now().to_rfc3339();
            let venue = "SIM".to_string();
            let fill = Fill { ts: ts.clone(), cl_ord_id: cl_ord_id.clone(), exec_id, symbol: input.symbol.clone(), price, qty: input.qty, venue };
            {
                let mut mem = state.inner.lock().unwrap();
                let pos = mem.positions.entry(input.symbol.clone()).or_insert(0);
                let delta = if input.side.to_uppercase() == "BUY" { input.qty } else { -input.qty };
                *pos += delta;
                mem.fills.push(fill);
            }
            let out = serde_json::json!({"cl_ord_id": cl_ord_id, "status": "FILLED"});
            Ok(Json(out))
        }
        "broker-gateway.get_positions" => {
            let mem = state.inner.lock().unwrap();
            let positions: Vec<serde_json::Value> = mem.positions.iter().map(|(sym, qty)| serde_json::json!({"symbol": sym, "qty": qty})).collect();
            Ok(Json(serde_json::json!({"positions": positions})))
        }
        "broker-gateway.get_fills" => {
            let mem = state.inner.lock().unwrap();
            Ok(Json(serde_json::json!({"fills": mem.fills})))
        }
        "broker-gateway.cancel" | "broker-gateway.replace" => {
            Ok(Json(serde_json::json!({"status":"UNSUPPORTED_IN_SIM"})))
        }
        _ => Err((axum::http::StatusCode::NOT_FOUND, "tool_not_found".into())),
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = AppState::default();
    let app = Router::new()
        .route("/health", get(health))
        .route("/call", post(call))
        .with_state(state);
    let port: u16 = std::env::var("PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(4006);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!(?addr, "starting broker-gateway");
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}
