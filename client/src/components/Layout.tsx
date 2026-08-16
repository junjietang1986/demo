import React, { useEffect, useState, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Layout as AntLayout,
  Menu,
  Button,
  Breadcrumb,
  Dropdown,
  Avatar,
  Badge,
  Space
} from 'antd';
import type { MenuProps } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  ProjectOutlined,
  FileTextOutlined,
  WarningOutlined,
  RocketOutlined,
  SettingOutlined,
  CheckSquareOutlined,
  ScheduleOutlined,
  ApiOutlined,
  AuditOutlined,
  BarChartOutlined,
  UserOutlined,
  LogoutOutlined,
  BellOutlined,
  UserSwitchOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  FolderOpenOutlined,
  TeamOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  AlertOutlined
} from '@ant-design/icons';
import { approvalApi, permissionApi } from '@/api';
import { useAppStore } from '@/store';

const { Header, Sider, Content } = AntLayout;

type MenuItem = Required<MenuProps>['items'][number];

const iconMap: Record<string, React.ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  ProjectOutlined: <ProjectOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  WarningOutlined: <WarningOutlined />,
  RocketOutlined: <RocketOutlined />,
  SettingOutlined: <SettingOutlined />,
  CheckSquareOutlined: <CheckSquareOutlined />,
  ScheduleOutlined: <ScheduleOutlined />,
  ApiOutlined: <ApiOutlined />,
  AuditOutlined: <AuditOutlined />,
  BarChartOutlined: <BarChartOutlined />,
  UserOutlined: <UserOutlined />,
  SafetyCertificateOutlined: <SafetyCertificateOutlined />,
  SafetyOutlined: <SafetyOutlined />,
  FolderOpenOutlined: <FolderOpenOutlined />,
  TeamOutlined: <TeamOutlined />,
  DatabaseOutlined: <DatabaseOutlined />,
  GlobalOutlined: <GlobalOutlined />,
  AlertOutlined: <AlertOutlined />
};

const defaultMenuItems: MenuItem[] = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: '工作台'
  },
  {
    key: '/projects',
    icon: <ProjectOutlined />,
    label: '项目管理'
  },
  {
    key: 'qms',
    icon: <FileTextOutlined />,
    label: 'QMS质量管理',
    children: [
      { key: '/qms/opl', icon: <FileTextOutlined />, label: 'OPL单点课程' },
      { key: '/qms/anomaly', icon: <WarningOutlined />, label: '过程异常/巡检' },
      { key: '/improvement', icon: <RocketOutlined />, label: '持续改进' }
    ]
  },
  {
    key: 'acceptance',
    icon: <CheckSquareOutlined />,
    label: '验收管理',
    children: [
      { key: '/acceptance/configs', icon: <SettingOutlined />, label: '验收配置' },
      { key: '/acceptance/forms', icon: <CheckSquareOutlined />, label: '验收单' },
      { key: '/acceptance/plans', icon: <ScheduleOutlined />, label: '验收计划' }
    ]
  },
  {
    key: 'approval',
    icon: <AuditOutlined />,
    label: '审批管理',
    children: [
      { key: '/approval/config', icon: <ApiOutlined />, label: '审批流程配置' },
      { key: '/approval/list', icon: <AuditOutlined />, label: '审批记录' }
    ]
  },
  {
    key: '/reports',
    icon: <BarChartOutlined />,
    label: '报表中心'
  },
  {
    key: 'ce',
    icon: <SafetyCertificateOutlined />,
    label: 'CE管理',
    children: [
      { key: '/ce-materials', icon: <SafetyCertificateOutlined />, label: 'CE物料存档库' },
      { key: '/ce-regulations', icon: <GlobalOutlined />, label: '国际法规核查清单' },
      { key: '/ce-export-control', icon: <AlertOutlined />, label: '进出口物料管控核查' },
      { key: '/ce-data-sources', icon: <ApiOutlined />, label: '法规数据源配置' }
    ]
  },
  {
    key: '/files',
    icon: <FolderOpenOutlined />,
    label: '文件管理'
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: '系统管理',
    children: [
      { key: '/users', icon: <UserOutlined />, label: '用户管理' },
      { key: '/settings/roles', icon: <TeamOutlined />, label: '角色配置' },
      { key: '/settings/feishu', icon: <SettingOutlined />, label: '飞书集成配置' },
      { key: '/settings/system', icon: <DatabaseOutlined />, label: '系统设置' },
      { key: '/settings/permissions', icon: <SafetyOutlined />, label: '权限配置' }
    ]
  }
];

const breadcrumbNameMap: Record<string, string> = {
  '/dashboard': '工作台',
  '/projects': '项目管理',
  '/qms': 'QMS质量管理',
  '/qms/opl': 'OPL单点课程',
  '/qms/anomaly': '过程异常/巡检',
  '/improvement': '持续改进',
  '/acceptance': '验收管理',
  '/acceptance/configs': '验收配置',
  '/acceptance/forms': '验收单',
  '/acceptance/plans': '验收计划',
  '/approval': '审批管理',
  '/approval/config': '审批流程配置',
  '/approval/list': '审批记录',
  '/reports': '报表中心',
  '/ce': 'CE管理',
  '/ce-materials': 'CE物料存档库',
  '/ce-regulations': '国际法规核查清单',
  '/ce-export-control': '进出口物料管控核查',
  '/ce-data-sources': '法规数据源配置',
  '/files': '文件管理',
  '/settings': '系统管理',
  '/users': '用户管理',
  '/settings/roles': '角色配置',
  '/settings/feishu': '飞书集成配置',
  '/settings/system': '系统设置',
  '/settings/permissions': '权限配置'
};

const SIDER_COLLAPSED_WIDTH = 80;
const SIDER_EXPANDED_WIDTH = 240;

function convertMenuTree(tree: any[]): MenuItem[] {
  return tree.map(item => {
    const menuItem: any = {
      key: item.key,
      icon: item.icon ? iconMap[item.icon] : undefined,
      label: item.label
    };
    if (item.children && item.children.length > 0) {
      menuItem.children = convertMenuTree(item.children);
    }
    return menuItem;
  });
}

const Layout: React.FC = () => {
  const { collapsed, setCollapsed, user, logout, permissions, setPermissions, token } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (token) {
        try {
          const perms = await permissionApi.getMyPermissions();
          setPermissions(perms);
        } catch (e) {
          console.error('Failed to fetch permissions', e);
        }
      }
    };
    fetchPermissions();
  }, [token, setPermissions]);

  const fetchPendingCount = async () => {
    try {
      const res: any = await approvalApi.myPending();
      setPendingCount(Array.isArray(res) ? res.length : (res?.data?.length || res?.total || 0));
    } catch {
      setPendingCount(0);
    }
  };

  useEffect(() => {
    fetchPendingCount();
    const timer = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(timer);
  }, []);

  const selectedKeys = useMemo(() => [location.pathname], [location.pathname]);

  const defaultOpenKeys = useMemo(() => {
    const path = location.pathname;
    if (path.startsWith('/qms') || path.startsWith('/improvement')) return ['qms'];
    if (path.startsWith('/acceptance')) return ['acceptance'];
    if (path.startsWith('/approval')) return ['approval'];
    if (path.startsWith('/users') || path.startsWith('/settings')) return ['settings'];
    if (path.startsWith('/ce-')) return ['ce'];
    return [];
  }, [location.pathname]);

  const buildMenuWithBadge = (items: MenuItem[]): MenuItem[] => {
    return items.map((item: any) => {
      if (item?.key === '/approval/list') {
        return {
          ...item,
          label: (
            <Badge count={pendingCount} size="small" offset={[10, 0]}>
              <span>{item.label}</span>
            </Badge>
          )
        };
      }
      if (item?.children) {
        return { ...item, children: buildMenuWithBadge(item.children) };
      }
      return item;
    });
  };

  const menuItems = useMemo<MenuItem[]>(() => {
    let base: MenuItem[];
    if (permissions?.menuTree && permissions.menuTree.length > 0) {
      base = convertMenuTree(permissions.menuTree);
    } else if (user?.role === 'admin' || user?.role === 'super_admin') {
      base = defaultMenuItems;
    } else {
      base = defaultMenuItems.filter(item => item?.key !== 'settings');
    }
    return buildMenuWithBadge(base);
  }, [permissions, user?.role, pendingCount]);

  const breadcrumbItems = useMemo(() => {
    const pathSnippets = location.pathname.split('/').filter(i => i);
    const items: { title: string; path?: string }[] = [{ title: '首页' }];
    let url = '';
    pathSnippets.forEach(snippet => {
      url += `/${snippet}`;
      if (breadcrumbNameMap[url]) {
        items.push({ title: breadcrumbNameMap[url] });
      }
    });
    return items.map((item, idx) => ({
      key: idx,
      title: idx === 0 ? <span onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>{item.title}</span> : item.title
    }));
  }, [location.pathname, navigate]);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userDropdownItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserSwitchOutlined />,
      label: user?.name || user?.username || '用户'
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout
    }
  ];

  const siderWidth = collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_EXPANDED_WIDTH;

  return (
    <AntLayout style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={SIDER_EXPANDED_WIDTH}
        collapsedWidth={SIDER_COLLAPSED_WIDTH}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          flex: '0 0 auto'
        }}
      >
        <div className={`app-logo ${collapsed ? 'collapsed' : ''}`}>
          {collapsed ? (
            <div className="app-logo-collapsed">KETC</div>
          ) : (
            <>
              <div className="app-logo-keboda">
                <span className="keboda-text">KEBODA</span>
                <span className="keboda-r">®</span>
              </div>
              <div className="app-logo-slogan">Creating Value, Sharing Progress</div>
              <div className="app-logo-title">KETC智造智控平台</div>
            </>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={defaultOpenKeys}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <AntLayout style={{ marginLeft: siderWidth, transition: 'all 0.2s', display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <Header
          style={{
            padding: '0 1.5rem',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1)',
            height: 56,
            lineHeight: '56px',
            flex: '0 0 auto'
          }}
        >
          <Space size="middle" wrap>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: '1rem' }}
            />
            <Breadcrumb items={breadcrumbItems} />
          </Space>
          <Space size="large" wrap>
            <Badge count={pendingCount} size="small">
              <Button
                type="text"
                icon={<BellOutlined style={{ fontSize: '1.125rem' }} />}
                onClick={() => navigate('/approval/list')}
              />
            </Badge>
            <Dropdown menu={{ items: userDropdownItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} src={user?.avatar} />
                <span>{user?.name || user?.username}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content
          style={{
            margin: 'var(--page-margin)',
            flex: 1,
            overflow: 'auto',
            minWidth: 0
          }}
        >
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
