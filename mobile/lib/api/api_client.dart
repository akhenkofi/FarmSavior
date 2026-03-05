import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  final String baseUrl;
  ApiClient({this.baseUrl = 'http://127.0.0.1:8000/api/v1'});

  Future<Map<String, dynamic>> register(Map<String, dynamic> payload) async {
    final res = await http.post(Uri.parse('$baseUrl/auth/register'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(payload));
    return jsonDecode(res.body);
  }

  Future<List<dynamic>> getListings() async {
    final res = await http.get(Uri.parse('$baseUrl/marketplace/listings'));
    return jsonDecode(res.body);
  }

  Future<List<dynamic>> getWeatherAlerts() async {
    final res = await http.get(Uri.parse('$baseUrl/weather/alerts'));
    return jsonDecode(res.body);
  }
}
