# Proveedor Ollama
La aplicación llama al proveedor desde el servidor. El adaptador actual permite HTTP loopback, sin credenciales en la URL. No envía AI_API_KEY a Ollama. La configuración de modelos y los prompts están conservados.
El desarrollo puede usar un túnel privado autorizado. Producción debe funcionar sin el PC: Next junto a Ollama en infraestructura autorizada o un gateway HTTPS autenticado con adaptación de transporte y pruebas. No exponer el puerto Ollama públicamente.
Medir timeout total, concurrencia y arranque frío. No inferir compatibilidad a partir de que una landing cargue.
