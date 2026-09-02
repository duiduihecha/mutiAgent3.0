'use client';

import { useState } from 'react';
import InteractiveGraphVisualization from '@/components/interactive-graph-visualization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Terminal, RefreshCw, Database, GitBranch } from 'lucide-react';

interface ConnectionTest {
  connected: boolean;
  message?: string;
  nodes?: number;
  relationships?: number;
}

export default function KnowledgeGraphPage() {
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<ConnectionTest | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/knowledge/graph', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: 'test' })
      });
      const data = await res.json();
      setConnection({
        connected: data.connected,
        message: data.message,
        nodes: data.nodes,
        relationships: data.relationships
      });
    } catch (error) {
      setConnection({
        connected: false,
        message: String(error)
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <GitBranch className="w-8 h-8" />
            知识图谱可视化
          </h1>
          <p className="text-muted-foreground mt-2">
            基于 Neo4j 图数据库的文化知识点关联网络 · 点击节点查看详情
          </p>
        </div>
        <Button onClick={handleTest} disabled={testing} variant="outline">
          {testing ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Terminal className="w-4 h-4 mr-2" />
          )}
          测试连接
        </Button>
      </div>

      {/* 连接状态 */}
      {connection && (
        <Alert variant={connection.connected ? 'default' : 'destructive'}>
          <AlertTitle>
            {connection.connected ? 'Neo4j 连接成功' : '连接失败'}
          </AlertTitle>
          <AlertDescription className="flex items-center gap-4">
            <span>{connection.message}</span>
            {connection.connected && (
              <>
                <Badge variant="outline">
                  <Database className="w-3 h-3 mr-1" />
                  {connection.nodes} 节点
                </Badge>
                <Badge variant="outline">
                  {connection.relationships} 关系
                </Badge>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 可视化 */}
      <Card>
        <CardHeader>
          <CardTitle>交互式知识图谱</CardTitle>
          <CardDescription>
            使用鼠标滚轮缩放，点击节点查看详情，支持按 HSK 等级和分类筛选
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InteractiveGraphVisualization key={refreshKey} />
        </CardContent>
      </Card>

      {/* 使用说明 */}
      <Tabs defaultValue="guide" className="w-full">
        <TabsList>
          <TabsTrigger value="guide">使用指南</TabsTrigger>
          <TabsTrigger value="api">API 接口</TabsTrigger>
        </TabsList>

        <TabsContent value="guide" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>交互操作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm">1</span>
                  </div>
                  <div>
                    <h4 className="font-medium">点击节点</h4>
                    <p className="text-sm text-muted-foreground">
                      查看节点详细信息、属性和关联关系
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm">2</span>
                  </div>
                  <div>
                    <h4 className="font-medium">缩放画布</h4>
                    <p className="text-sm text-muted-foreground">
                      使用工具栏的 +/- 按钮或鼠标滚轮缩放
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm">3</span>
                  </div>
                  <div>
                    <h4 className="font-medium">筛选节点</h4>
                    <p className="text-sm text-muted-foreground">
                      按 HSK 等级或分类筛选关注的知识点
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm">4</span>
                  </div>
                  <div>
                    <h4 className="font-medium">搜索节点</h4>
                    <p className="text-sm text-muted-foreground">
                      输入关键词快速定位特定知识点
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="font-medium">图例说明</h4>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <span className="text-sm">HSK 1-2 等级</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-amber-500"></div>
                    <span className="text-sm">HSK 3-4 等级</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-red-500"></div>
                    <span className="text-sm">HSK 5-6 等级</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-amber-400"></div>
                    <span className="text-sm">传统文化</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-blue-400"></div>
                    <span className="text-sm">当代中国</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-400"></div>
                    <span className="text-sm">社会生活</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>API 接口</CardTitle>
              <CardDescription>知识图谱相关 API 接口</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge>GET</Badge>
                      <code className="text-sm">/api/knowledge/graph?action=stats</code>
                    </div>
                    <p className="text-sm text-muted-foreground">获取图谱统计信息</p>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge>GET</Badge>
                      <code className="text-sm">/api/knowledge/graph?action=nodes</code>
                    </div>
                    <p className="text-sm text-muted-foreground">获取所有知识点节点</p>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge>GET</Badge>
                      <code className="text-sm">/api/knowledge/graph?action=contrasts</code>
                    </div>
                    <p className="text-sm text-muted-foreground">获取跨文化对比关系</p>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge>GET</Badge>
                      <code className="text-sm">/api/knowledge/graph?action=level&level=2</code>
                    </div>
                    <p className="text-sm text-muted-foreground">按 HSK 等级筛选节点</p>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge>GET</Badge>
                      <code className="text-sm">/api/knowledge/graph?action=kp_contrasts&kp_id=1</code>
                    </div>
                    <p className="text-sm text-muted-foreground">获取指定知识点的跨文化对比</p>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge>POST</Badge>
                      <code className="text-sm">{'{ "action": "test" }'}</code>
                    </div>
                    <p className="text-sm text-muted-foreground">测试连接状态</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
