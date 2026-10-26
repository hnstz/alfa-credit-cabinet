package ru.oldzoomer.alfacreditbackend.repository;

import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;
import ru.oldzoomer.alfacreditbackend.entity.Draft;

import java.util.Optional;

@Repository
public interface DraftRepository extends CrudRepository<Draft, String> {

    Optional<Draft> findByUserId(String userId);
}
