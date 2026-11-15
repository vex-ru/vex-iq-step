use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VexCategory {
    pub id: String,
    pub name: String,
    pub count: usize,
    pub description: String,
    pub icon_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VexPartItem {
    pub id: u32,
    pub category_id: String,
    pub category_name: String,
    pub filename: String,
    pub name: String,
    pub sku: String,
    pub size_str: String,
    pub is3mf: bool,
    pub part_type: String,
    pub relative_path: String,
    #[serde(default)]
    pub pitch_dimensions: String,
}

const CATEGORIES_JSON: &str = include_str!("../assets/vex_categories.json");
const CATALOG_JSON: &str = include_str!("../assets/vex_catalog.json");

pub fn load_embedded_categories() -> Vec<VexCategory> {
    serde_json::from_str(CATEGORIES_JSON).unwrap_or_default()
}

pub fn load_embedded_parts() -> Vec<VexPartItem> {
    serde_json::from_str(CATALOG_JSON).unwrap_or_default()
}

impl VexPartItem {
    pub fn matches_query(&self, query: &str) -> bool {
        if query.is_empty() {
            return true;
        }
        let q = query.to_lowercase();
        self.sku.to_lowercase().contains(&q)
            || self.name.to_lowercase().contains(&q)
            || self.filename.to_lowercase().contains(&q)
            || self.pitch_dimensions.to_lowercase().contains(&q)
    }
}
