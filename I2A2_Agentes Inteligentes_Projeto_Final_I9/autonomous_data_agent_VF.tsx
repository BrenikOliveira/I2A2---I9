import React, { useState, useRef, useEffect } from 'react';
import { Upload, MessageSquare, BarChart3, FileText, Send, Loader2, RefreshCw, X, Brain, AlertTriangle, Shield, TrendingUp, Search } from 'lucide-react';
import { BarChart, Bar, LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import * as math from 'mathjs';
import _ from 'lodash';

export default function AutonomousDataAgent() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState(null);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [dataProfile, setDataProfile] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const parseLargeFile = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          let data = null;
          let columns = [];
          if (file.name.endsWith('.csv')) {
            const text = e.target.result;
            const lines = text.split(/\r?\n/).filter(line => line.trim());
            if (lines.length === 0) return resolve(null);
            columns = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
            data = lines.slice(1).map(line => {
              const values = line.split(',');
              const obj = {};
              columns.forEach((col, idx) => {
                const val = values[idx]?.trim();
                obj[col] = isNaN(val) ? val : parseFloat(val);
              });
              return obj;
            });
          } else if (file.name.endsWith('.json')) {
            const text = e.target.result;
            data = JSON.parse(text);
            if (Array.isArray(data) && data.length > 0) columns = Object.keys(data[0]);
          }
          resolve({ data, columns, rowCount: data?.length || 0, columnCount: columns.length });
        } catch (err) {
          resolve(null);
        }
      };
      reader.readAsText(file);
    });
  };

  const createAgentContext = (data) => {
    const cols = data.columns;
    const rows = data.data;
    const numericCols = cols.filter(col => rows.some(row => !isNaN(parseFloat(row[col])) && row[col] !== ''));
    const categoricalCols = cols.filter(col => !numericCols.includes(col));
    const columnContext = cols.map(col => {
      const lower = col.toLowerCase();
      let type = 'unknown';
      if (lower.includes('valor') || lower.includes('price') || lower.includes('amount')) type = 'financial';
      else if (lower.includes('data') || lower.includes('date') || lower.includes('time')) type = 'temporal';
      else if (lower.includes('id') || lower.includes('codigo')) type = 'identifier';
      return { column: col, type, isNumeric: numericCols.includes(col) };
    });
    const stats = {};
    numericCols.forEach(col => {
      const values = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(values.length * 0.25)];
        const q3 = sorted[Math.floor(values.length * 0.75)];
        const iqr = q3 - q1;
        stats[col] = {
          mean: _.mean(values),
          median: math.median(values),
          std: math.std(values),
          min: _.min(values),
          max: _.max(values),
          q1: q1,
          q3: q3,
          outliers: values.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).length,
          zeros: values.filter(v => v === 0).length,
          duplicates: values.length - new Set(values).size
        };
      }
    });
    return { columnContext, numericCols, categoricalCols, stats, rowCount: rows.length };
  };

  const fraudDetectionAgent = (profile, data) => {
    const alerts = [];
    const internalPrompt = `Analisando ${profile.rowCount} registros. Detectar fraudes e anomalias.`;
    profile.numericCols.forEach(col => {
      const stat = profile.stats[col];
      if (stat.outliers > profile.rowCount * 0.05) {
        alerts.push({
          severity: 'high',
          column: col,
          message: `${stat.outliers} outliers (${((stat.outliers/profile.rowCount)*100).toFixed(1)}%)`,
          recommendation: 'Investigar valores extremos'
        });
      }
      if (stat.duplicates > profile.rowCount * 0.3) {
        alerts.push({
          severity: 'medium',
          column: col,
          message: `${stat.duplicates} duplicados (${((stat.duplicates/profile.rowCount)*100).toFixed(1)}%)`,
          recommendation: 'Possível clonagem de dados'
        });
      }
      const colContext = profile.columnContext.find(c => c.column === col);
      if (stat.zeros > profile.rowCount * 0.2 && colContext?.type === 'financial') {
        alerts.push({
          severity: 'high',
          column: col,
          message: `${stat.zeros} valores zero (${((stat.zeros/profile.rowCount)*100).toFixed(1)}%)`,
          recommendation: 'Transações zeradas são suspeitas'
        });
      }
    });
    return { alerts, internalPrompt };
  };

  const insightAgent = (profile) => {
    const insights = [];
    const completeness = profile.numericCols.length > 0 ? profile.numericCols.reduce((acc, col) => {
      const stat = profile.stats[col];
      return acc + ((profile.rowCount - stat.zeros) / profile.rowCount);
    }, 0) / profile.numericCols.length : 0;
    insights.push({ type: 'quality', title: 'Qualidade', message: `${(completeness * 100).toFixed(1)}% completo` });
    const riskScore = profile.numericCols.length > 0 ? profile.numericCols.reduce((acc, col) => {
      const stat = profile.stats[col];
      let risk = 0;
      if (stat.outliers > profile.rowCount * 0.1) risk += 0.3;
      if (stat.duplicates > profile.rowCount * 0.5) risk += 0.3;
      return acc + risk;
    }, 0) / profile.numericCols.length : 0;
    insights.push({ type: 'risk', title: 'Risco', message: riskScore > 0.5 ? 'Alto' : riskScore > 0.3 ? 'Moderado' : 'Baixo' });
    return insights;
  };

  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) return;
    if (uploadedFile.size / (1024 * 1024) > 50) {
      alert('Arquivo muito grande! Máximo: 50MB.');
      return;
    }
    setFile(uploadedFile);
    setFileName(uploadedFile.name);
    const parsed = await parseLargeFile(uploadedFile);
    setFileData(parsed);
    if (parsed) {
      const profile = createAgentContext(parsed);
      setDataProfile(profile);
    }
  };

  const generateChart = (type, data, xKey, yKey) => {
    if (!data || data.length === 0) return null;
    const chartData = data.slice(0, 30);
    try {
      if (type === 'bar') {
        return (
          <div className="bg-slate-900 rounded-lg p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey={xKey} angle={-45} textAnchor="end" height={80} stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #7c3aed' }} />
                <Bar dataKey={yKey} fill="#a78bfa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      } else if (type === 'line') {
        return (
          <div className="bg-slate-900 rounded-lg p-4">
            <ResponsiveContainer width="100%" height={300}>
              <RechartsLineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey={xKey} angle={-45} textAnchor="end" height={80} stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #7c3aed' }} />
                <Line type="monotone" dataKey={yKey} stroke="#f472b6" strokeWidth={2} />
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
        );
      } else if (type === 'scatter') {
        return (
          <div className="bg-slate-900 rounded-lg p-4">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis type="number" dataKey={xKey} stroke="#94a3b8" />
                <YAxis type="number" dataKey={yKey} stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #7c3aed' }} />
                <Scatter data={chartData} fill="#a78bfa" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        );
      }
    } catch (error) {
      return null;
    }
  };

  const startAnalysis = () => {
    setAnalysisStarted(true);
    setTimeout(() => {
      const fraudAnalysis = fraudDetectionAgent(dataProfile, fileData);
      const insights = insightAgent(dataProfile);
      setMessages([
        {
          type: 'system',
          content: `🤖 AGENTE INICIALIZADO\n\n📊 ${fileData.rowCount} linhas × ${fileData.columnCount} colunas\n🔢 ${dataProfile.numericCols.length} numéricas`,
          timestamp: new Date().toLocaleTimeString('pt-BR')
        },
        {
          type: 'assistant',
          content: `🧠 ANÁLISE COMPLETA\n\nPrompt Interno: "${fraudAnalysis.internalPrompt}"`,
          insights: insights,
          timestamp: new Date().toLocaleTimeString('pt-BR')
        },
        {
          type: 'assistant',
          content: `🚨 FRAUDES: ${fraudAnalysis.alerts.length} alertas`,
          alerts: fraudAnalysis.alerts,
          timestamp: new Date().toLocaleTimeString('pt-BR')
        }
      ]);
    }, 2000);
  };

  const intelligentAnalyze = (query) => {
    const lowerQuery = query.toLowerCase();
    let response = '';
    let chart = null;
    if (lowerQuery.includes('fraude') || lowerQuery.includes('suspeito')) {
      const fraudAnalysis = fraudDetectionAgent(dataProfile, fileData);
      response = `🔍 FRAUDES\n\n`;
      if (fraudAnalysis.alerts.length === 0) {
        response += 'Nenhum padrão crítico detectado.';
      } else {
        response += fraudAnalysis.alerts.slice(0, 3).map(a => `${a.severity === 'high' ? '🟠' : '🟡'} ${a.message}\n💡 ${a.recommendation}`).join('\n\n');
      }
      return { response, chart, alerts: fraudAnalysis.alerts };
    }
    if (lowerQuery.includes('insight') || lowerQuery.includes('resumo')) {
      const insights = insightAgent(dataProfile);
      response = `💡 INSIGHTS\n\n` + insights.map(i => `${i.title}: ${i.message}`).join('\n');
      return { response, chart, insights };
    }
    if (lowerQuery.includes('correlação') && dataProfile.numericCols.length >= 2) {
      const col1 = dataProfile.numericCols[0];
      const col2 = dataProfile.numericCols[1];
      const values1 = fileData.data.map(r => parseFloat(r[col1])).filter(v => !isNaN(v));
      const values2 = fileData.data.map(r => parseFloat(r[col2])).filter(v => !isNaN(v));
      const corr = math.corr(values1, values2);
      response = `📊 Correlação ${col1} × ${col2}: ${corr.toFixed(4)}`;
      chart = generateChart('scatter', fileData.data, col1, col2);
      return { response, chart };
    }
    const col = dataProfile.numericCols[0];
    const stat = dataProfile.stats[col];
    response = `📊 "${col}"\n\n• Média: ${stat.mean.toFixed(2)}\n• Mediana: ${stat.median.toFixed(2)}\n• Outliers: ${stat.outliers}`;
    chart = generateChart('line', fileData.data, fileData.columns[0], col);
    return { response, chart };
  };

  const sendMessage = () => {
    if (!inputMessage.trim() || isProcessing || !fileData) return;
    setMessages(prev => [...prev, { type: 'user', content: inputMessage, timestamp: new Date().toLocaleTimeString('pt-BR') }]);
    setInputMessage('');
    setIsProcessing(true);
    setTimeout(() => {
      const result = intelligentAnalyze(inputMessage);
      setMessages(prev => [...prev, { type: 'assistant', content: result.response, chart: result.chart, alerts: result.alerts, insights: result.insights, timestamp: new Date().toLocaleTimeString('pt-BR') }]);
      setIsProcessing(false);
    }, 1500);
  };

  const resetAnalysis = () => {
    setFile(null);
    setFileName('');
    setFileData(null);
    setAnalysisStarted(false);
    setMessages([]);
    setInputMessage('');
    setIsProcessing(false);
    setDataProfile(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Brain className="w-12 h-12 text-purple-400" />
            <h1 className="text-4xl font-bold text-white">Agente Autônomo com IA</h1>
          </div>
          <p className="text-slate-300 text-lg">Análise inteligente • Detecção de fraudes • Auto-prompting</p>
        </div>

        {!analysisStarted ? (
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-800 rounded-xl p-8 shadow-2xl border border-purple-500/30">
              <div className="text-center mb-6">
                <Upload className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Carregar Dataset</h2>
                <p className="text-slate-400">CSV ou JSON • Máx. 50MB</p>
              </div>
              <input type="file" accept=".csv,.json" onChange={handleFileUpload} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="block w-full py-4 px-6 bg-purple-600 hover:bg-purple-700 text-white rounded-lg cursor-pointer transition-all text-center font-semibold">
                Selecionar Arquivo
              </label>
              {fileName && dataProfile && (
                <div className="mt-6 p-4 bg-slate-700 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-purple-400" />
                      <span className="text-white font-medium">{fileName}</span>
                    </div>
                    <button onClick={resetAnalysis} className="text-red-400 hover:text-red-300">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="text-sm text-slate-300 space-y-2">
                    <p>📊 {fileData.rowCount} linhas × {fileData.columnCount} colunas</p>
                    <p>🔢 {dataProfile.numericCols.length} colunas numéricas</p>
                    <button onClick={startAnalysis} className="mt-4 w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2">
                      <Brain className="w-5 h-5" />
                      Iniciar Análise + Detecção de Fraudes
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              <div className="bg-slate-800 p-6 rounded-lg border border-purple-500/20">
                <Brain className="w-8 h-8 text-purple-400 mb-3" />
                <h3 className="text-white font-semibold mb-2">Auto-Prompting</h3>
                <p className="text-slate-400 text-sm">Agente cria próprios prompts</p>
              </div>
              <div className="bg-slate-800 p-6 rounded-lg border border-purple-500/20">
                <Shield className="w-8 h-8 text-green-400 mb-3" />
                <h3 className="text-white font-semibold mb-2">Detecção de Fraudes</h3>
                <p className="text-slate-400 text-sm">Identifica padrões suspeitos</p>
              </div>
              <div className="bg-slate-800 p-6 rounded-lg border border-purple-500/20">
                <TrendingUp className="w-8 h-8 text-cyan-400 mb-3" />
                <h3 className="text-white font-semibold mb-2">Insights Dinâmicos</h3>
                <p className="text-slate-400 text-sm">Análise adaptada aos dados</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl shadow-2xl border border-purple-500/30 overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 border-b border-purple-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Brain className="w-6 h-6 text-purple-400" />
                <div>
                  <h3 className="text-white font-semibold">Agente Autônomo</h3>
                  <p className="text-slate-400 text-sm">{fileName}</p>
                </div>
              </div>
              <button onClick={resetAnalysis} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all">
                <RefreshCw className="w-4 h-4" />
                Reiniciar
              </button>
            </div>
            <div className="h-96 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-3xl ${msg.type === 'user' ? 'bg-purple-600' : msg.type === 'system' ? 'bg-slate-700' : 'bg-slate-900'} rounded-lg p-4`}>
                    <div className="flex items-start gap-3">
                      {msg.type === 'assistant' && <Brain className="w-5 h-5 text-purple-400 mt-1 flex-shrink-0" />}
                      <div className="flex-1">
                        <p className="text-white whitespace-pre-line text-sm">{msg.content}</p>
                        {msg.insights && (
                          <div className="mt-4 space-y-2">
                            {msg.insights.map((insight, i) => (
                              <div key={i} className="bg-slate-800 p-3 rounded">
                                <div className="flex items-center gap-2 mb-1">
                                  {insight.type === 'quality' && <Shield className="w-4 h-4 text-green-400" />}
                                  {insight.type === 'risk' && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                                  <span className="text-white font-semibold text-sm">{insight.title}</span>
                                </div>
                                <p className="text-slate-300 text-xs">{insight.message}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.alerts && msg.alerts.length > 0 && (
                          <div className="mt-4 space-y-2">
                            {msg.alerts.slice(0, 5).map((alert, i) => (
                              <div key={i} className={`p-3 rounded ${alert.severity === 'high' ? 'bg-orange-900/50' : 'bg-yellow-900/50'}`}>
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="w-4 h-4 text-white mt-1 flex-shrink-0" />
                                  <div>
                                    <p className="text-white text-xs font-semibold">{alert.column}</p>
                                    <p className="text-slate-200 text-xs">{alert.message}</p>
                                    <p className="text-slate-300 text-xs mt-1 italic">{alert.recommendation}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.chart && <div className="mt-4">{msg.chart}</div>}
                        <p className="text-slate-400 text-xs mt-2">{msg.timestamp}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-slate-900 rounded-lg p-4 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                    <span className="text-white">Processando...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="bg-slate-900 px-6 py-4 border-t border-purple-500/30">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Pergunte sobre fraudes, insights, correlação..."
                  className="flex-1 bg-slate-800 text-white px-4 py-3 rounded-lg border border-purple-500/30 focus:outline-none focus:border-purple-500"
                  disabled={isProcessing}
                />
                <button
                  onClick={sendMessage}
                  disabled={isProcessing || !inputMessage.trim()}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white rounded-lg transition-all flex items-center gap-2"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}