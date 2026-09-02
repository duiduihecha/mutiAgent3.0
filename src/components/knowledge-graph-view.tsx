'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface GraphStats {
  nodes: number;
  relationships: number;
  cultures: string[];
  dimensions: string[];
}

interface CultureNode {
  id: string;
  topic: string | null;
  hsk_level: string | null;
  category: string | null;
  subcategory: string | null;
  [key: string]: unknown;
}

interface Contrast {
  source_id: string;
  source_topic: string;
  target_id: string;
  target_topic: string;
  target_culture: string;
  cultural_dimension: string;
  similarities: string;
  differences: string;
}

const CULTURE_NAMES: Record<string, string> = {
  en: '英语圈',
  ja: '日语圈',
  ko: '韩语圈',
  es: '西班牙语圈',
  fr: '法语圈',
  ar: '阿拉伯语圈',
  ru: '俄语圈',
  th: '泰语圈'
};

// 提取 HSK 等级数字
const extractHskLevel = (level: string | null): number => {
  if (!level) return 0;
  const match = level.match(/HSK\s*(\d+)/i);
  return match ? parseInt(match[1]) : 0;
};

// 提取 HSK 等级范围
const extractHskRange = (level: string | null): string => {
  if (!level) return '未分类';
  if (level.includes('-')) return level;
  const num = extractHskLevel(level);
  return `HSK ${num}`;
};

export default function KnowledgeGraphView() {
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [nodes, setNodes] = useState<CultureNode[]>([]);
  const [contrasts, setContrasts] = useState<Contrast[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGraphData();
  }, []);

  const fetchGraphData = async () => {
    try {
      setError(null);
      const [statsRes, nodesRes] = await Promise.all([
        fetch('/api/knowledge/graph?action=stats'),
        fetch('/api/knowledge/graph?action=nodes')
      ]);

      const statsData = await statsRes.json();
      const nodesData = await nodesRes.json();

      if (!statsData.success) {
        throw new Error(statsData.error || '获取统计失败');
      }

      setStats(statsData.stats);
      
      // 过滤有效的节点（有 id 或有 topic 的）
      const validNodes = (nodesData.nodes || []).filter((n: CultureNode) => 
        n.id || n.topic || n.category
      );
      setNodes(validNodes);

      // 尝试获取对比数据
      try {
        const contrastsRes = await fetch('/api/knowledge/graph?action=contrasts');
        const contrastsData = await contrastsRes.json();
        if (contrastsData.success) {
          setContrasts(contrastsData.contrasts || []);
        }
      } catch {
        // 对比数据可能不存在，忽略
      }
    } catch (err) {
      console.error('Failed to fetch graph data:', err);
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 过滤有效的节点（有 id 或有 topic 或有 category 的）
  const validNodes = nodes.filter((n: CultureNode) => 
    n.id || n.topic || n.category
  );

  // 统计各等级数量
  const groupedByLevel = validNodes.reduce((acc, node) => {
    const level = extractHskRange(node.hsk_level) || '未分类';
    if (!acc[level]) acc[level] = [];
    acc[level].push(node);
    return acc;
  }, {} as Record<string, CultureNode[]>);

  const levelCounts = Object.entries(groupedByLevel).reduce((acc, [level, levelNodes]) => {
    acc[level] = levelNodes.length;
    return acc;
  }, {} as Record<string, number>);

  // 根据 HSK 等级筛选
  const filteredByLevel = selectedLevel === 'all'
    ? validNodes
    : selectedLevel === 'has_id'
    ? validNodes.filter(n => n.id)
    : validNodes.filter(n => n.hsk_level?.includes(selectedLevel.replace('hsk', '')));

  // 根据搜索词筛选
  const filteredNodes = searchTerm
    ? filteredByLevel.filter(n => 
        n.topic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.id?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : filteredByLevel;

  const getCategoryColor = (category: string | null) => {
    if (!category) return 'bg-gray-100 text-gray-800 border-gray-300';
    if (category.includes('传统') || category.includes('文化')) return 'bg-amber-100 text-amber-800 border-amber-300';
    if (category.includes('当代') || category.includes('中国')) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (category.includes('社会') || category.includes('生活')) return 'bg-green-100 text-green-800 border-green-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">加载知识图谱...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* 搜索和筛选 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <Input
          placeholder="搜索知识点..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        
        {/* HSK 等级筛选 */}
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={selectedLevel === 'all' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedLevel('all')}
          >
            全部 ({nodes.length})
          </Badge>
          <Badge
            variant={selectedLevel === 'hsk1-2' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedLevel('hsk1-2')}
          >
            HSK 1-2 ({levelCounts['HSK1-2'] || 0})
          </Badge>
          <Badge
            variant={selectedLevel === 'hsk3-4' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedLevel('hsk3-4')}
          >
            HSK 3-4 ({levelCounts['HSK3-4'] || 0})
          </Badge>
          <Badge
            variant={selectedLevel === 'hsk5-6' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedLevel('hsk5-6')}
          >
            HSK 5-6 ({levelCounts['HSK5-6'] || 0})
          </Badge>
          <Badge
            variant={selectedLevel === 'has_topic' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedLevel('has_topic')}
          >
            有Topic ({nodes.filter(n => n.topic).length})
          </Badge>
        </div>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-primary">{stats?.nodes || 0}</div>
            <div className="text-sm text-muted-foreground">有效知识点</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-primary">{nodes.length}</div>
            <div className="text-sm text-muted-foreground">节点总数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-primary">{Object.keys(levelCounts).length}</div>
            <div className="text-sm text-muted-foreground">HSK 等级</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-primary">{stats?.relationships || 0}</div>
            <div className="text-sm text-muted-foreground">关系数量</div>
          </CardContent>
        </Card>
      </div>

      {/* 分类标签 */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm font-medium">分类：</span>
        <Badge variant="outline" className="bg-amber-50">传统文化</Badge>
        <Badge variant="outline" className="bg-blue-50">当代中国</Badge>
        <Badge variant="outline" className="bg-green-50">社会生活</Badge>
      </div>

      {/* 知识点列表 */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList>
          <TabsTrigger value="list">知识点列表</TabsTrigger>
          <TabsTrigger value="bylevel">按等级分组</TabsTrigger>
          <TabsTrigger value="graph">图谱视图</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredNodes.slice(0, 50).map((node, idx) => (
                <Card key={node.id || `node-${idx}`} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {node.topic ? (
                          <h4 className="font-medium truncate">{node.topic}</h4>
                        ) : (
                          <h4 className="font-medium text-muted-foreground truncate">
                            {node.id || `节点 ${idx + 1}`}
                          </h4>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {node.hsk_level && (
                            <Badge variant="outline" className="text-xs">
                              {extractHskRange(node.hsk_level)}
                            </Badge>
                          )}
                          {node.category && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getCategoryColor(node.category)}`}
                            >
                              {node.category.replace(/\s+/g, '')}
                            </Badge>
                          )}
                        </div>
                        {node.id && (
                          <p className="text-xs text-muted-foreground mt-2 truncate">
                            ID: {node.id}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {filteredNodes.length > 50 && (
              <p className="text-center text-muted-foreground mt-4">
                显示前 50 条，共 {filteredNodes.length} 条
              </p>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="bylevel" className="space-y-4">
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {Object.entries(groupedByLevel).map(([level, levelNodes]) => (
                <div key={level}>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Badge variant="secondary">{level}</Badge>
                    <span className="text-sm text-muted-foreground">({levelNodes.length} 个)</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
                    {levelNodes.slice(0, 12).map((node, idx) => (
                      <Card key={node.id || `l-${idx}`} className="p-2">
                        <p className="text-sm truncate">
                          {node.topic || node.id || `节点 ${idx + 1}`}
                        </p>
                        {node.category && (
                          <p className="text-xs text-muted-foreground truncate">
                            {node.category.replace(/\s+/g, '')}
                          </p>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="graph" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>知识图谱结构</CardTitle>
              <CardDescription>
                基于 Neo4j 图数据库的文化知识点关联网络
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* 图例 */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-amber-400"></div>
                    <span>传统文化</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-blue-400"></div>
                    <span>当代中国</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-400"></div>
                    <span>社会生活</span>
                  </div>
                </div>

                <Separator />

                {/* 可视化 */}
                <div className="relative h-[300px] bg-muted/20 rounded-lg p-4 overflow-hidden">
                  {/* 中心节点 */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm text-center shadow-lg">
                      文化<br/>知识
                    </div>
                  </div>

                  {/* 周边节点 - 按等级分布 */}
                  {Object.entries(groupedByLevel).slice(0, 3).map(([level, levelNodes], idx) => {
                    const angle = (idx * 120 + 30) * (Math.PI / 180);
                    const radius = 90;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;
                    const colors = ['bg-amber-400', 'bg-blue-400', 'bg-green-400'];
                    const count = Math.min(levelNodes.length, 3);

                    return (
                      <div key={level}>
                        {Array.from({ length: count }).map((_, i) => {
                          const offsetAngle = angle + (i - 1) * 0.3;
                          const offsetX = Math.cos(offsetAngle) * 20;
                          const offsetY = Math.sin(offsetAngle) * 20;
                          return (
                            <div
                              key={i}
                              className={`absolute w-10 h-10 rounded-full ${colors[idx]} flex items-center justify-center text-white text-xs text-center p-1 shadow-md`}
                              style={{
                                left: `calc(50% + ${x + offsetX}px - 20px)`,
                                top: `calc(50% + ${y + offsetY}px - 20px)`
                              }}
                              title={levelNodes[i]?.topic || level}
                            >
                              {level.replace('HSK', '').replace('-', '-')}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* 连接线 */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {Object.entries(groupedByLevel).slice(0, 3).map(([_, levelNodes], idx) => {
                      const angle = (idx * 120 + 30) * (Math.PI / 180);
                      const x2 = Math.cos(angle) * 90 + 150;
                      const y2 = Math.sin(angle) * 90 + 150;
                      return (
                        <line
                          key={idx}
                          x1="150"
                          y1="150"
                          x2={x2}
                          y2={y2}
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-primary/30"
                        />
                      );
                    })}
                  </svg>
                </div>

                <div className="text-center text-sm text-muted-foreground">
                  共 {nodes.length} 个节点，{Object.keys(groupedByLevel).length} 个 HSK 等级
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
