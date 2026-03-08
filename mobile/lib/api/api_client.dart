import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  final String baseUrl;
  ApiClient({String? baseUrl})
      : baseUrl = baseUrl ?? const String.fromEnvironment('FARMSAVIOR_API_BASE_URL', defaultValue: 'https://api.farmsavior.com/api/v1');

  Future<Map<String, dynamic>> register(Map<String, dynamic> payload) async {
    final res = await http.post(Uri.parse('$baseUrl/auth/register'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(payload));
    return jsonDecode(res.body);
  }

  Future<Map<String, dynamic>> login(Map<String, dynamic> payload) async {
    final res = await http.post(Uri.parse('$baseUrl/auth/login'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(payload));
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
