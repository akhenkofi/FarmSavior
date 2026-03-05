import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const FarmSaviorApp());
}

class FarmSaviorApp extends StatelessWidget {
  const FarmSaviorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FarmSavior',
      theme: ThemeData(primarySwatch: Colors.green),
      home: const HomeScreen(),
    );
  }
}
