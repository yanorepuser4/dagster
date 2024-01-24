import {useQuery} from '@apollo/client';
import {
  Box,
  Popover,
  Spinner,
  TextInput,
  colorBackgroundDefault,
  colorTextDefault,
  colorTextLight,
} from '@dagster-io/ui-components';
import {useVirtualizer} from '@tanstack/react-virtual';
import * as React from 'react';
import styled from 'styled-components';

import {PythonErrorInfo} from '../../app/PythonErrorInfo';
import {FIFTEEN_SECONDS, useQueryRefreshAtInterval} from '../../app/QueryRefresh';
import {useTrackPageView} from '../../app/analytics';
import {toGroupId, tokenForAssetKey} from '../../asset-graph/Utils';
import {ASSET_CATALOG_TABLE_QUERY} from '../../assets/AssetsCatalogTable';
import {AssetTableFragment} from '../../assets/types/AssetTableFragment.types';
import {
  AssetCatalogTableQuery,
  AssetCatalogTableQueryVariables,
} from '../../assets/types/AssetsCatalogTable.types';
import {useDocumentTitle} from '../../hooks/useDocumentTitle';
import {useQueryPersistedState} from '../../hooks/useQueryPersistedState';
import {useStateWithStorage} from '../../hooks/useStateWithStorage';
import {RunChunks, RunChunk, MIN_CHUNK_WIDTH, MIN_WIDTH_FOR_MULTIPLE} from '../../runs/RunTimeline';
import {batchRunsForTimeline} from '../../runs/batchRunsForTimeline';
import {mergeStatusToBackground} from '../../runs/mergeStatusToBackground';
import {Container, HeaderCell, Inner, Row, RowCell} from '../../ui/VirtualizedTable';
import {buildRepoPathForHuman} from '../../workspace/buildRepoAddress';

const COLLATOR = new Intl.Collator(navigator.language, {sensitivity: 'base', numeric: true});

export type NodeNonAssetType =
  | {groupName: string; id: string; level: number}
  | {locationName: string; id: string; level: number};

export type NodeType =
  | NodeNonAssetType
  | {path: string; id: string; asset: AssetTableFragment; level: number};

type Props = {
  Header: React.ComponentType<{refreshState: ReturnType<typeof useQueryRefreshAtInterval>}>;
  TabButton: React.ComponentType<{selected: 'timeline' | 'assets'}>;
};
export const OverviewAssetsRoot = ({Header, TabButton}: Props) => {
  useTrackPageView();
  useDocumentTitle('Overview | Assets');

  const query = useQuery<AssetCatalogTableQuery, AssetCatalogTableQueryVariables>(
    ASSET_CATALOG_TABLE_QUERY,
    {
      notifyOnNetworkStatusChange: true,
    },
  );
  const refreshState = useQueryRefreshAtInterval(query, FIFTEEN_SECONDS);

  const groupedAssetsUnfiltered = React.useMemo(() => {
    if (query.data?.assetsOrError.__typename === 'AssetConnection') {
      const assets = query.data.assetsOrError.nodes;
      return groupAssets(assets);
    }
    return [];
  }, [query.data?.assetsOrError]);

  const [searchValue, setSearchValue] = useQueryPersistedState<string>({
    queryKey: 'q',
    decode: (qs) => (qs.searchQuery ? JSON.parse(qs.searchQuery) : ''),
    encode: (searchQuery) => ({searchQuery: searchQuery ? JSON.stringify(searchQuery) : undefined}),
  });

  const lowerCaseSearchValue = searchValue.toLowerCase();

  const groupedAssetsFiltered = React.useMemo(() => {
    if (lowerCaseSearchValue === '') {
      return groupedAssetsUnfiltered;
    }
    const filteredGroups: typeof groupedAssetsUnfiltered = [];
    groupedAssetsUnfiltered.forEach((group) => {
      if (
        (group.groupName || UNGROUPED_ASSETS).toLowerCase().includes(lowerCaseSearchValue) ||
        group.repositoryName.toLowerCase().includes(lowerCaseSearchValue)
      ) {
        filteredGroups.push(group);
      } else {
        const filteredGroupAssets = group.assets.filter((asset) =>
          tokenForAssetKey(asset.key).toLowerCase().includes(lowerCaseSearchValue),
        );
        if (filteredGroupAssets.length) {
          filteredGroups.push({
            ...group,
            assets: filteredGroupAssets,
          });
        }
      }
    });
    return filteredGroups;
  }, [groupedAssetsUnfiltered, lowerCaseSearchValue]);

  const [openNodes, setOpenNodes] = React.useState<Set<string>>(() => new Set());

  const [sidebarWidth, setSidebarWidth] = useStateWithStorage(
    'assets-timeline-sidebar-width',
    (json) => {
      try {
        const int = parseInt(json);
        if (!isNaN(int)) {
          return int;
        }
      } catch (e) {}
      return 306;
    },
  );

  const renderedNodes = React.useMemo(() => {
    const nodes: NodeType[] = [];

    // Map of Code Locations -> Groups -> Assets
    const codeLocationNodes: Record<
      string,
      {
        locationName: string;
        groups: Record<
          string,
          {
            groupName: string;
            assets: AssetTableFragment[];
          }
        >;
      }
    > = {};

    let groupsCount = 0;
    groupedAssetsFiltered.forEach((group) => {
      const {repositoryName, locationName, groupName: _groupName, assets} = group;
      const groupName = _groupName || 'default';

      const groupId = toGroupId(repositoryName, locationName, groupName);
      const codeLocation = buildRepoPathForHuman(repositoryName, locationName);
      codeLocationNodes[codeLocation] = codeLocationNodes[codeLocation] || {
        locationName: codeLocation,
        groups: {},
      };

      if (!codeLocationNodes[codeLocation]!.groups[groupId]!) {
        groupsCount += 1;
      }

      codeLocationNodes[codeLocation]!.groups[groupId] = codeLocationNodes[codeLocation]!.groups[
        groupName
      ] || {
        groupName,
        assets,
      };

      const codeLocationsCount = Object.keys(codeLocationNodes).length;
      Object.entries(codeLocationNodes).forEach(([locationName, locationNode]) => {
        nodes.push({locationName, id: locationName, level: 1});
        if (openNodes.has(locationName) || codeLocationsCount === 1) {
          Object.entries(locationNode.groups).forEach(([id, groupNode]) => {
            nodes.push({groupName: groupNode.groupName, id, level: 2});
            if (openNodes.has(id) || groupsCount === 1) {
              groupNode.assets
                .sort((a, b) => COLLATOR.compare(tokenForAssetKey(a.key), tokenForAssetKey(b.key)))
                .forEach((asset) => {
                  const key = tokenForAssetKey(asset.key);
                  nodes.push({
                    id: key,
                    asset,
                    path: locationName + ':' + groupNode.groupName + ':' + key,
                    level: 3,
                  });
                });
            }
          });
        }
      });
    });
    return nodes;
  }, [openNodes, groupedAssetsFiltered]);

  const parentRef = React.useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: renderedNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 5,
  });

  const totalHeight = rowVirtualizer.getTotalSize();
  const items = rowVirtualizer.getVirtualItems();

  function content() {
    const result = query.data?.assetsOrError;
    if (!query.data && query.loading) {
      return (
        <Box
          flex={{alignItems: 'center', justifyContent: 'center', direction: 'column', grow: 1}}
          style={{width: '100%'}}
        >
          <Spinner purpose="page" />
        </Box>
      );
    }
    if (result?.__typename === 'PythonError') {
      return (
        <Box
          flex={{alignItems: 'center', justifyContent: 'center', direction: 'column', grow: 1}}
          style={{width: '100%'}}
        >
          <PythonErrorInfo error={result} />
        </Box>
      );
    }

    console.log({renderedNodes});

    return (
      <Box flex={{direction: 'column'}} style={{overflow: 'hidden'}}>
        <Container ref={parentRef}>
          <VirtualHeaderRow
            sidebarWidth={sidebarWidth}
            searchValue={searchValue}
            setSearchValue={setSearchValue}
          />
          <Inner $totalHeight={totalHeight}>
            {items.map(({index, key, size, start}) => {
              const node = renderedNodes[index]!;
              return (
                <VirtualRow
                  key={key}
                  start={start}
                  height={size}
                  node={node}
                  sidebarWidth={sidebarWidth}
                />
              );
            })}
          </Inner>
        </Container>
      </Box>
    );
  }

  return (
    <>
      <div style={{position: 'sticky', top: 0, zIndex: 1}}>
        <Header refreshState={refreshState} />
        <Box
          padding={{horizontal: 24, vertical: 16}}
          flex={{alignItems: 'center', gap: 12, grow: 0}}
        >
          <TabButton selected="assets" />
          <TextInput
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
            }}
            placeholder="Filter asset groups…"
          />
        </Box>
      </div>
      {content()}
    </>
  );
};

type Assets = Extract<
  AssetCatalogTableQuery['assetsOrError'],
  {__typename: 'AssetConnection'}
>['nodes'];

function groupAssets(assets: Assets) {
  const groups: Record<
    string,
    {
      groupName: string | null;
      repositoryName: string;
      locationName: string;
      assets: Assets;
    }
  > = {};

  assets.forEach((asset) => {
    if (!asset.definition) {
      return;
    }
    const groupName = asset.definition.groupName;
    const repositoryName = asset.definition.repository.name;
    const locationName = asset.definition.repository.location.name;
    const key = `${groupName}||${repositoryName}`;
    const target = groups[key] || {
      groupName,
      repositoryName,
      locationName,
      assets: [] as Assets,
    };
    target.assets.push(asset);
    groups[key] = target;
  });
  return Object.values(groups);
}

function VirtualHeaderRow({
  sidebarWidth,
  searchValue,
  setSearchValue,
}: {
  sidebarWidth: number;
  searchValue: string;
  setSearchValue: (value: string) => void;
}) {
  return (
    <Box
      border="top"
      style={{
        display: 'grid',
        gridTemplateColumns: `${sidebarWidth}px 1fr`,
        fontSize: '12px',
        color: colorTextLight(),
        position: 'sticky',
        top: 0,
        zIndex: 1,
        background: colorBackgroundDefault(),
      }}
    >
      <HeaderCell>
        <div style={{display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)'}}>
          <TextInput
            value={searchValue}
            icon="search"
            placeholder="Filter assets"
            onChange={(e: React.ChangeEvent<any>) => {
              setSearchValue(e.target.value);
            }}
          />
        </div>
      </HeaderCell>
      <Box border="bottom">
        <HeaderCell></HeaderCell>
      </Box>
    </Box>
  );
}

const UNGROUPED_ASSETS = 'Ungrouped Assets';

type RowProps = {
  height: number;
  start: number;
  sidebarWidth: number;
  node: NodeType;
};
function VirtualRow({height, start, sidebarWidth, node}: RowProps) {
  const batched = React.useMemo(() => {
    const batches: RunBatch<TimelineRun>[] = batchRunsForTimeline({
      runs,
      start,
      end,
      width,
      minChunkWidth: MIN_CHUNK_WIDTH,
      minMultipleWidth: MIN_WIDTH_FOR_MULTIPLE,
    });

    return batches;
  }, [runs, start, end, width]);

  return (
    <Row $height={height} $start={start}>
      <RowGrid $sidebarWidth={sidebarWidth}>
        <Cell>
          <div />
        </Cell>
        <Cell>
          <RunChunks>
            {batched.map((batch) => {
              const {left, width, runs} = batch;
              const runCount = runs.length;
              return (
                <RunChunk
                  key={batch.runs[0]!.id}
                  $background={mergeStatusToBackground(batch.runs)}
                  $multiple={runCount > 1}
                  style={{
                    left: `${left}px`,
                    width: `${width}px`,
                  }}
                >
                  <Popover
                    content={<RunHoverContent job={job} batch={batch} />}
                    position="top"
                    interactionKind="hover"
                    className="chunk-popover-target"
                  >
                    <Box
                      flex={{direction: 'row', justifyContent: 'center', alignItems: 'center'}}
                      style={{height: '100%'}}
                    >
                      {runCount > 1 ? <BatchCount>{batch.runs.length}</BatchCount> : null}
                    </Box>
                  </Popover>
                </RunChunk>
              );
            })}
          </RunChunks>
        </Cell>
      </RowGrid>
    </Row>
  );
}

const RowGrid = styled(Box)<{$sidebarWidth: number}>`
  display: grid;
  grid-template-columns: ${({$sidebarWidth}) => `${$sidebarWidth}px 1fr`};
  height: 100%;
  > * {
    vertical-align: middle;
  }
`;

const Cell = ({children}: {children: React.ReactNode}) => {
  return (
    <RowCell style={{color: colorTextDefault()}}>
      <Box flex={{direction: 'row', alignItems: 'center', grow: 1}}>{children}</Box>
    </RowCell>
  );
};