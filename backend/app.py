from flask import Flask, jsonify
from flask_cors import CORS


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

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)

