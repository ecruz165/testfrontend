'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Breadcrumb, Breadcrumbs, Link } from 'react-aria-components';
import { DrugConditionDetailsStackedBarChart } from '@/app/_components/DrugConditionDetailsStackedBarChart';
import { DrugConditionDetailsTable } from '@/app/_components/DrugConditionDetailsTable';
import { Card } from '@nextui-org/card';
import {
  fetchDrugById,
  fetchDrugConditionByDrugIdAndOutcomeConceptId,
  fetchDrugConditionDetailList,
} from '@/app/_services/services';
import { notFound } from 'next/navigation';
import { useAsyncList } from '@react-stately/data';

import BreadcrumbsClasses from '@/app/_components/Breadcrumbs.module.css';
import { Checkbox, Input } from '@nextui-org/react';
import { SearchIcon } from '@/app/_components/SearchIcon';

interface DrugConditionDetailsViewManagerProps {
  drugConceptId: number;
  outcomeConceptId: number;
}

interface DrugConditionDetail {
  source_short_name: string;
  source_country: string;
  incidence_proportion: number;
  incidence_rate: number;
  num_persons_at_risk: number;
  requires_full_time_at_risk: string;
}
interface TimeAtRiskSummary {
  NO: number;
  YES: number;
}

interface DrugConditionDetailsGroupedByCountryAndTimeAtRisk {
  source_country: string;
  requires_full_time_at_risk: TimeAtRiskSummary;
}

function getSortedRateSources(itemsOrig: DrugConditionDetail[]) {
  const items = [...itemsOrig];
  return items.sort((a, b) =>
    a.incidence_rate < b.incidence_rate
      ? 1
      : a.incidence_rate > b.incidence_rate
      ? -1
      : 0
  );
}

function groupByCountryAndRisk(
  arr: DrugConditionDetail[]
): DrugConditionDetailsGroupedByCountryAndTimeAtRisk[] {
  const result: Record<string, TimeAtRiskSummary> = arr.reduce((acc, item) => {
    // @ts-ignore
    if (!acc[item.source_country]) {
      // @ts-ignore
      acc[item.source_country] = {
        NO: 0,
        YES: 0,
      };
    }

    // @ts-ignore
    acc[item.source_country][item.requires_full_time_at_risk.toUpperCase()] +=
      item.num_persons_at_risk;

    return acc;
  }, {});

  return Object.entries(result).map(([country, riskData]) => ({
    source_country: country,
    requires_full_time_at_risk: riskData as TimeAtRiskSummary,
  }));
}

export const DrugConditionDetailsViewManager = ({
  drugConceptId,
  outcomeConceptId,
}: DrugConditionDetailsViewManagerProps) => {
  const [isValid, setIsValid] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [drug, setDrug] = useState<Drug>({
    drug_concept_id: drugConceptId,
    drug_concept_name: '',
  });
  const [drugCondition, setDrugCondition] = useState<DrugCondition>({
    outcome_concept_id: outcomeConceptId,
    outcome_concept_name: '',
    incidence_proportion_range_low: 0,
    incidence_proportion_range_high: 0,
  });

  const [lowerBoundRate, setLowerBoundRate] = useState<number>(0);
  const [upperBoundRate, setUpperBoundRate] = useState<number>(0);
  const [chartCategories, setChartCategories] = useState<string[]>([]);
  const [chartDataGroup1, setChartDataGroup1] = useState<number[]>([]);
  const [chartDataGroup2, setChartDataGroup2] = useState<number[]>([]);
  const [filterValue, setFilterValue] = useState<string>('');
  const [matchWord, setMatchWord] = useState<boolean>(false);
  const [matchCase, setMatchCase] = useState<boolean>(false);

  let list = useAsyncList<DrugConditionDetail>({
    async load({ signal }) {
      let json = [];
      json = await fetchDrugConditionDetailList(drugConceptId, outcomeConceptId)
        .then((data) => {
          setIsValid(true);
          return data;
        })
        .catch((error) => {
          setIsValid(false);
          return [];
        });

      if (filterValue.length > 0) {
        const filterWords = matchCase
          ? filterValue.split(/\s+/)
          : filterValue.toLowerCase().split(/\s+/);

        json = json.filter((item: DrugConditionDetail) => {
          // Convert all fields to string, and to lowercase if matchCase is false
          const combinedFields = [
            item.source_short_name,
            item.source_country,
            item.incidence_proportion.toString(),
            item.incidence_rate.toString(),
            item.num_persons_at_risk.toString(),
            item.requires_full_time_at_risk,
          ].map((field) => (matchCase ? field : field.toLowerCase()));

          if (matchWord) {
            return filterWords.some((word) =>
              combinedFields.some((field) => field === word)
            );
          } else {
            return filterWords.some((word) =>
              combinedFields.some((field) => field.includes(word))
            );
          }
        });
      }

      setIsLoading(false);
      return {
        items: json,
      };
    },
    async sort({ items, sortDescriptor }) {
      return {
        items: items.sort((a, b) => {
          const columnA: any = sortDescriptor.column;
          const columnB: any = sortDescriptor.column;
          // @ts-ignore
          let first = a[columnA];
          // @ts-ignore
          let second = b[columnB];
          let cmp =
            (parseInt(first) || first) < (parseInt(second) || second) ? -1 : 1;

          if (sortDescriptor.direction === 'descending') {
            cmp *= -1;
          }
          return cmp;
        }),
      };
    },
  });

  useEffect(() => {
    fetchDrugById(drugConceptId)
      .then((data) => {
        setDrug(data);
      })
      .catch((error) => {
        console.error(`Error occurred fetching drug for: ${drugConceptId}`);
      });
    fetchDrugConditionByDrugIdAndOutcomeConceptId(
      drugConceptId,
      outcomeConceptId
    )
      .then((data) => {
        setDrugCondition(data);
      })
      .catch((error) => {
        console.error(
          `Error occurred fetching drug condition for: ${outcomeConceptId}`
        );
      });
  }, [drugConceptId, outcomeConceptId]);

  useEffect(() => {
    list.reload();
  }, [filterValue, matchWord, matchCase, list.filterText]);

  useEffect(() => {
    if (!list.isLoading) {
      const sortedItems = getSortedRateSources(list.items);
      if (sortedItems.length > 0) {
        const lowerBoundRate =
          sortedItems[sortedItems.length - 1].incidence_rate;
        const upperBoundRate = sortedItems[0].incidence_rate;
        const groupedByCountryAndRisk = groupByCountryAndRisk(sortedItems);
        const countries = groupedByCountryAndRisk.map(
          (item) => item.source_country
        );
        const timeAtRiskNO = groupedByCountryAndRisk.map(
          (item) => item.requires_full_time_at_risk.NO
        );
        const timeAtRiskYES = groupedByCountryAndRisk.map(
          (item) => item.requires_full_time_at_risk.YES
        );
        setLowerBoundRate(lowerBoundRate);
        setUpperBoundRate(upperBoundRate);
        setChartCategories(countries);
        setChartDataGroup1(timeAtRiskNO);
        setChartDataGroup2(timeAtRiskYES);
      }
    }
  }, [list.isLoading]);

  if (!isLoading && !isValid) {
    return notFound();
  } else
    return (
      <>
        <Card className='w-full max-w-screen-xl p-16 text-center'>
          <h1>Risk of cardiac arrhythmia with {drug.drug_concept_name}</h1>
          <p className='m-auto max-w-screen-md'>
            Amongst patients taking {drug.drug_concept_name}, onset of cardiac
            arrhythmia occurs in {lowerBoundRate}% to {upperBoundRate}% of
            patients during the 1 year after starting the drug
          </p>
          <DrugConditionDetailsStackedBarChart
            className={'pt-8'}
            isLoading={isLoading}
            drug={drug}
            drugCondition={drugCondition}
            chartCategories={chartCategories}
            chartDataGroup1={chartDataGroup1}
            chartDataGroup2={chartDataGroup2}
          />
        </Card>
        <Card className='w-full max-w-screen-xl p-16 '>
          <Breadcrumbs className={BreadcrumbsClasses.Breadcrumbs}>
            <Breadcrumb className={BreadcrumbsClasses.Breadcrumb}>
              <Link className={BreadcrumbsClasses.Link}>
                <a href='/'>Home</a>
              </Link>
            </Breadcrumb>
            <Breadcrumb className={BreadcrumbsClasses.Breadcrumb}>
              <Link className={BreadcrumbsClasses.Link}>
                <a href={'/' + drug.drug_concept_id}>
                  {drug.drug_concept_name + ' Drug Conditions'}
                </a>
              </Link>
            </Breadcrumb>
            <Breadcrumb className={BreadcrumbsClasses.Breadcrumb}>
              <Link className={BreadcrumbsClasses.Link}>
                {drugCondition.outcome_concept_name + ' Sources and Rates'}
              </Link>
            </Breadcrumb>
          </Breadcrumbs>
          <div className='flex w-full'>
            <Input
              isClearable
              classNames={{
                base: 'w-full max-w-screen-sm',
                inputWrapper: 'border-1',
              }}
              placeholder='Filter data ...'
              size='sm'
              startContent={<SearchIcon className='text-default-300' />}
              value={filterValue}
              variant='bordered'
              onClear={() => setFilterValue('')}
              onValueChange={setFilterValue}
            />
          </div>
          <div className='mb-4 mt-2 pl-8 text-sm text-gray-500'>
            Match{' '}
            <Checkbox
              className={'ml-2 text-sm text-gray-500'}
              defaultSelected={matchWord}
              radius='full'
              onValueChange={setMatchWord}
            >
              <span className={'text-sm text-gray-500'}>word</span>
            </Checkbox>
            <Checkbox
              className={'ml-2 text-sm text-gray-500'}
              defaultSelected={matchCase}
              radius='full'
              onValueChange={setMatchCase}
            >
              <span className={'text-sm text-gray-500'}>case</span>
            </Checkbox>
          </div>
          <DrugConditionDetailsTable
            isLoading={isLoading}
            asyncDataList={list}
            className='w-full max-w-screen-xl p-16'
          />
        </Card>
      </>
    );
};
