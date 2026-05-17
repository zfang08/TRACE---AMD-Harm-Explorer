import os
import pathlib
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

# frontend/dist/ 相对于 backend/ 的路径
DIST_DIR = pathlib.Path(__file__).parent.parent / "frontend" / "dist"


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    # 延后导入，避免循环引用
    from routes.harm_routes import harm_routes
    from routes.colliery_routes import colliery_routes
    from routes.station_routes import station_routes
    from routes.simulation_routes import simulation_routes

    app.register_blueprint(harm_routes)
    app.register_blueprint(colliery_routes)
    app.register_blueprint(station_routes)
    app.register_blueprint(simulation_routes)

    @app.route("/api/health")
    def health_check():
        return jsonify({"status": "ok"}), 200

    # 生产环境：Flask 托管构建好的 React SPA
    if DIST_DIR.exists():
        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_spa(path):
            target = DIST_DIR / path
            if path and target.is_file():
                return send_from_directory(DIST_DIR, path)
            return send_from_directory(DIST_DIR, "index.html")

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)

